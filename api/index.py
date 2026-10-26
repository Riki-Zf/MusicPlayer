import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import yt_dlp
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from ytmusicapi import YTMusic
from ytmusicapi.models.content.enums import LikeStatus


app = FastAPI(title="Spotify Dupe API")
public_yt = YTMusic()
_authenticated_yt: YTMusic | None = None


def authenticated_yt() -> YTMusic:
    global _authenticated_yt
    auth_json = os.environ.get("YTMUSIC_AUTH_JSON")
    auth_file = os.environ.get("YTMUSIC_AUTH_FILE")

    if auth_json:
        try:
            auth_data = json.loads(auth_json)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=503, detail="YTMUSIC_AUTH_JSON is not valid JSON.") from error
        if not isinstance(auth_data, dict):
            raise HTTPException(status_code=503, detail="YTMUSIC_AUTH_JSON must contain an object.")
        if _authenticated_yt is None:
            _authenticated_yt = YTMusic(auth=auth_data)
        return _authenticated_yt

    if auth_file:
        file_path = Path(auth_file)
        if not file_path.is_absolute():
            file_path = Path(__file__).resolve().parent.parent / file_path
        if not file_path.is_file():
            raise HTTPException(status_code=503, detail="The YTMUSIC_AUTH_FILE does not exist.")
        if _authenticated_yt is None:
            _authenticated_yt = YTMusic(auth=str(file_path))
        return _authenticated_yt

    raise HTTPException(status_code=503, detail="Configure YTMUSIC_AUTH_JSON in Vercel to enable account features.")


def parse_limit(value: str | None, default: int, maximum: int) -> int:
    try:
        limit = int(value) if value else default
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Limit must be an integer.") from error
    if limit < 1 or limit > maximum:
        raise HTTPException(status_code=400, detail=f"Limit must be between 1 and {maximum}.")
    return limit


def parse_non_negative_limit(value: str | None, default: int, maximum: int) -> int:
    try:
        limit = int(value) if value is not None else default
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Limit must be an integer.") from error
    if limit < 0 or limit > maximum:
        raise HTTPException(status_code=400, detail=f"Limit must be between 0 and {maximum}.")
    return limit


def require_array(value: Any, name: str) -> list[Any]:
    if not isinstance(value, list) or not value:
        raise HTTPException(status_code=400, detail=f"{name} must be a non-empty array.")
    return value


def normalized_path(path: str) -> str:
    route = "/" + path.lstrip("/")
    if route == "/api":
        return "/"
    if route.startswith("/api/"):
        route = route[4:]
    if route == "/index":
        return "/"
    return route


def handle_request(method: str, route: str, query: dict[str, str], body: dict[str, Any]) -> Any:
    segments = [unquote(part) for part in route.strip("/").split("/") if part]
    if not segments:
        return {"status": "ok"}

    if method == "GET" and segments == ["search"]:
        search_query = query.get("q")
        if not search_query:
            raise HTTPException(status_code=400, detail="Query is required.")
        search_filter = query.get("filter", "songs")
        allowed_filters = {
            "all", "songs", "videos", "albums", "artists", "playlists",
            "community_playlists", "featured_playlists", "profiles", "podcasts", "episodes",
        }
        if search_filter not in allowed_filters:
            raise HTTPException(status_code=400, detail="Invalid search filter.")
        scope = query.get("scope") or None
        if scope and scope not in ("uploads", "library"):
            raise HTTPException(status_code=400, detail="Invalid search scope.")
        return public_yt.search(
            search_query,
            filter=None if search_filter == "all" else search_filter,
            scope=scope,
            limit=parse_limit(query.get("limit"), 20, 100),
            ignore_spelling=query.get("ignoreSpelling") == "true",
        )

    if method == "GET" and segments == ["search", "suggestions"]:
        if not query.get("q"):
            raise HTTPException(status_code=400, detail="Query is required.")
        return public_yt.get_search_suggestions(query["q"], detailed_runs=query.get("detailed") == "true")

    if method == "GET" and len(segments) == 2 and segments[0] == "artist":
        return public_yt.get_artist(segments[1])

    if method == "GET" and len(segments) == 3 and segments[0] == "artist" and segments[2] == "albums":
        params = query.get("params")
        if not params:
            raise HTTPException(status_code=400, detail="Artist albums params are required.")
        order = query.get("order") or None
        if order and order not in ("Recency", "Popularity", "Alphabetical order"):
            raise HTTPException(status_code=400, detail="Invalid artist albums order.")
        return public_yt.get_artist_albums(
            segments[1],
            params,
            limit=parse_limit(query.get("limit"), 100, 1000),
            order=order,
        )

    if method == "GET" and len(segments) == 2 and segments[0] == "user":
        return public_yt.get_user(segments[1])

    if method == "GET" and len(segments) == 3 and segments[0] == "user" and segments[2] in ("videos", "playlists"):
        params = query.get("params")
        if not params:
            raise HTTPException(status_code=400, detail=f"User {segments[2]} params are required.")
        method_name = "get_user_videos" if segments[2] == "videos" else "get_user_playlists"
        return getattr(public_yt, method_name)(segments[1], params)

    if method == "GET" and segments == ["library", "status"]:
        auth_json = os.environ.get("YTMUSIC_AUTH_JSON")
        auth_file = os.environ.get("YTMUSIC_AUTH_FILE")
        file_exists = bool(auth_file and (Path(auth_file).is_file() or (Path(__file__).resolve().parent.parent / auth_file).is_file()))
        return {"configured": bool(auth_json or file_exists)}

    if method == "GET" and len(segments) == 2 and segments[0] == "library":
        category = segments[1]
        limit = parse_limit(query.get("limit"), 50, 500)
        order = query.get("order") or None
        if order and order not in ("a_to_z", "z_to_a", "recently_added"):
            raise HTTPException(status_code=400, detail="Invalid library order.")
        client = authenticated_yt()
        if category == "history":
            return client.get_history()
        library_methods = {
            "playlists": ("get_library_playlists", False),
            "songs": ("get_library_songs", True),
            "artists": ("get_library_artists", True),
            "albums": ("get_library_albums", True),
            "subscriptions": ("get_library_subscriptions", True),
            "podcasts": ("get_library_podcasts", True),
            "channels": ("get_library_channels", True),
        }
        if category not in library_methods:
            raise HTTPException(status_code=400, detail="Unsupported library category.")
        method_name, supports_order = library_methods[category]
        kwargs: dict[str, Any] = {"limit": limit}
        if supports_order:
            kwargs["order"] = order
        return getattr(client, method_name)(**kwargs)

    if method == "POST" and segments == ["library", "rate"]:
        item_type, item_id, rating_name = body.get("type"), body.get("id"), body.get("rating")
        if item_type not in ("song", "album", "playlist") or not item_id:
            raise HTTPException(status_code=400, detail="A supported type and item id are required.")
        try:
            rating = LikeStatus(rating_name)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid rating.") from error
        client = authenticated_yt()
        if item_type == "song":
            return client.rate_song(item_id, rating)
        return client.rate_playlist(item_id, rating)

    if len(segments) == 4 and segments[:2] == ["library", "artists"] and segments[3] == "subscription":
        channel_id = segments[2]
        client = authenticated_yt()
        if method == "POST":
            return client.subscribe_artist(channel_id)
        if method == "DELETE":
            return client.unsubscribe_artists([channel_id])

    if segments == ["library", "history"] and method == "GET":
        return authenticated_yt().get_history()

    if segments == ["library", "history"] and method == "DELETE":
        tokens = require_array(body.get("feedbackTokens"), "feedbackTokens")
        return authenticated_yt().remove_history_items(tokens)

    if len(segments) == 2 and segments[0] == "playlists":
        playlist_id = segments[1]
        client = authenticated_yt()
        if method == "GET":
            return client.get_playlist(
                playlist_id,
                limit=parse_limit(query.get("limit"), 100, 500),
                suggestions_limit=parse_non_negative_limit(query.get("suggestionsLimit"), 0, 50),
            )
        if method == "DELETE":
            return client.delete_playlist(playlist_id)
        if method == "PATCH":
            privacy = body.get("privacyStatus")
            if privacy and privacy not in ("PRIVATE", "PUBLIC", "UNLISTED"):
                raise HTTPException(status_code=400, detail="Invalid playlist privacy status.")
            move_item = body.get("moveItem")
            successor = body.get("successorSetVideoId")
            if move_item and successor:
                move_item = (move_item, successor)
            return client.edit_playlist(
                playlist_id,
                title=body.get("title"),
                description=body.get("description"),
                privacyStatus=privacy,
                moveItem=move_item,
            )

    if method == "POST" and segments == ["playlists"]:
        title = body.get("title")
        privacy = body.get("privacyStatus", "PRIVATE")
        video_ids = body.get("videoIds", [])
        if not isinstance(title, str) or not title.strip():
            raise HTTPException(status_code=400, detail="Playlist title is required.")
        if privacy not in ("PRIVATE", "PUBLIC", "UNLISTED"):
            raise HTTPException(status_code=400, detail="Invalid playlist privacy status.")
        if not isinstance(video_ids, list):
            raise HTTPException(status_code=400, detail="videoIds must be an array.")
        return authenticated_yt().create_playlist(
            title.strip(),
            body.get("description", ""),
            privacy_status=privacy,
            video_ids=video_ids or None,
        )

    if len(segments) == 3 and segments[0] == "playlists" and segments[2] == "tracks":
        client = authenticated_yt()
        if method == "POST":
            video_ids = require_array(body.get("videoIds"), "videoIds")
            return client.add_playlist_items(segments[1], videoIds=video_ids)
        if method == "DELETE":
            videos = require_array(body.get("videos"), "videos")
            if any(not item.get("videoId") or not item.get("setVideoId") for item in videos):
                raise HTTPException(status_code=400, detail="Each playlist video needs videoId and setVideoId.")
            return client.remove_playlist_items(segments[1], videos)

    if len(segments) == 2 and segments[0] == "podcasts":
        if segments[1] == "episodes-playlist":
            return authenticated_yt().get_episodes_playlist(query.get("playlistId", "RDPN"))
        return authenticated_yt().get_podcast(
            segments[1],
            limit=parse_limit(query.get("limit"), 100, 500),
        )

    if len(segments) == 2 and segments[0] == "channels":
        return authenticated_yt().get_channel(segments[1])

    if len(segments) == 3 and segments[0] == "channels" and segments[2] == "episodes":
        params = query.get("params")
        if not params:
            raise HTTPException(status_code=400, detail="Channel episodes params are required.")
        return authenticated_yt().get_channel_episodes(segments[1], params)

    if len(segments) == 1 and segments[0] == "album" and method == "GET":
        browse_id = query.get("browseId")
        if not browse_id:
            raise HTTPException(status_code=400, detail="Album browseId is required.")
        return public_yt.get_album(browse_id)
    if len(segments) == 2 and segments[0] == "album" and method == "GET":
        return public_yt.get_album(segments[1])

    if len(segments) == 2 and segments[0] == "song" and method == "GET":
        return public_yt.get_song(segments[1])

    if len(segments) == 2 and segments[0] == "stream" and method == "GET":
        video_id = segments[1]
        options = {"format": "bestaudio/best", "quiet": True, "no_warnings": True}
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
        if not info or not info.get("url"):
            raise HTTPException(status_code=502, detail="No audio stream URL was returned.")
        return {"url": info["url"]}

    if len(segments) == 2 and segments[0] == "lyrics" and method == "GET":
        playlist = public_yt.get_watch_playlist(videoId=segments[1])
        lyrics_id = playlist.get("lyrics")
        if not lyrics_id:
            return {"error": "No lyrics found"}
        return public_yt.get_lyrics(lyrics_id, timestamps=True) or {"error": "No lyrics found"}

    if segments == ["watch"] or (len(segments) == 2 and segments[0] == "watch"):
        video_id = segments[1] if len(segments) == 2 else query.get("videoId")
        playlist_id = query.get("playlistId")
        if not video_id and not playlist_id:
            raise HTTPException(status_code=400, detail="videoId or playlistId is required.")
        watch = public_yt.get_watch_playlist(
            videoId=video_id,
            playlistId=playlist_id,
            limit=parse_limit(query.get("limit"), 25, 100),
            radio=query.get("radio") == "true",
            shuffle=query.get("shuffle") == "true",
        )
        return watch if query.get("includeMetadata") == "true" else watch.get("tracks", [])

    if segments == ["charts"] and method == "GET":
        country = query.get("country", "ID").upper()
        if country != "ZZ" and not re.fullmatch(r"[A-Z]{2}", country):
            raise HTTPException(status_code=400, detail="Country must be a two-letter ISO country code.")
        return public_yt.get_charts(country=country)

    raise HTTPException(status_code=404, detail="API route not found.")


async def dispatch(request: Request, path: str = "") -> JSONResponse:
    forwarded_route = request.query_params.get("_route")
    route = normalized_path(forwarded_route if forwarded_route is not None else path)
    try:
        raw_body = await request.body() if request.method in ("POST", "PATCH", "DELETE") else b""
        body_data = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        return JSONResponse({"error": "Request body must be valid JSON."}, status_code=400)
    if not isinstance(body_data, dict):
        return JSONResponse({"error": "Request body must be a JSON object."}, status_code=400)

    try:
        result = await run_in_threadpool(
            handle_request,
            request.method,
            route,
            {key: value for key, value in request.query_params.items() if key != "_route"},
            body_data,
        )
        return JSONResponse(jsonable_encoder(result))
    except HTTPException as error:
        return JSONResponse({"error": error.detail}, status_code=error.status_code)
    except Exception as error:
        print(f"API request failed ({request.method} {route}): {error}")
        return JSONResponse({"error": str(error)}, status_code=500)


@app.api_route("/", methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"], response_model=None)
async def api_root(request: Request) -> JSONResponse | Response:
    if request.method == "OPTIONS":
        return Response(status_code=204)
    return await dispatch(request)


@app.api_route("/{path:path}", methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"], response_model=None)
async def api_catch_all(path: str, request: Request) -> JSONResponse | Response:
    if request.method == "OPTIONS":
        return Response(status_code=204)
    return await dispatch(request, path)
