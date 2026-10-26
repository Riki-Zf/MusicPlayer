import sys
import json
import os
from ytmusicapi import YTMusic
from ytmusicapi.models.content.enums import LikeStatus
import yt_dlp

# Memastikan output stdout menggunakan encoding UTF-8 di Windows
sys.stdout.reconfigure(encoding='utf-8')

yt = YTMusic()
authenticated_yt = None


def get_auth_file_path():
    auth_file = os.environ.get("YTMUSIC_AUTH_FILE")
    if not auth_file:
        return None
    if not os.path.isabs(auth_file):
        auth_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), auth_file)
    return auth_file


def get_authenticated_yt():
    global authenticated_yt
    auth_file = get_auth_file_path()
    if not auth_file:
        raise RuntimeError("Set YTMUSIC_AUTH_FILE in backend/.env to a local ytmusicapi auth file.")
    if not os.path.isfile(auth_file):
        raise RuntimeError("The file configured by YTMUSIC_AUTH_FILE does not exist.")
    if authenticated_yt is None:
        authenticated_yt = YTMusic(auth=auth_file)
    return authenticated_yt

command = sys.argv[1] if len(sys.argv) > 1 else ""

if command == "search":
    query = sys.argv[2]
    search_filter = sys.argv[3] or "songs" if len(sys.argv) > 3 else "songs"
    if search_filter == "all":
        search_filter = None
    scope = sys.argv[4] or None if len(sys.argv) > 4 else None
    limit = int(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else 20
    ignore_spelling = len(sys.argv) > 6 and sys.argv[6].lower() == "true"
    results = yt.search(query, filter=search_filter, scope=scope, limit=limit, ignore_spelling=ignore_spelling)
    print(json.dumps(results, ensure_ascii=False))

elif command == "suggestions":
    query = sys.argv[2]
    detailed = len(sys.argv) > 3 and sys.argv[3].lower() == "true"
    results = yt.get_search_suggestions(query, detailed_runs=detailed)
    print(json.dumps(results, ensure_ascii=False))

elif command == "artist":
    channel_id = sys.argv[2]
    print(json.dumps(yt.get_artist(channel_id), ensure_ascii=False))

elif command == "artist_albums":
    channel_id = sys.argv[2]
    params = sys.argv[3]
    limit = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else 100
    order = sys.argv[5] or None if len(sys.argv) > 5 else None
    albums = yt.get_artist_albums(channel_id, params, limit=limit, order=order)
    print(json.dumps(albums, ensure_ascii=False))

elif command == "user":
    channel_id = sys.argv[2]
    print(json.dumps(yt.get_user(channel_id), ensure_ascii=False))

elif command == "user_videos":
    channel_id = sys.argv[2]
    params = sys.argv[3]
    print(json.dumps(yt.get_user_videos(channel_id, params), ensure_ascii=False))

elif command == "user_playlists":
    channel_id = sys.argv[2]
    params = sys.argv[3]
    print(json.dumps(yt.get_user_playlists(channel_id, params), ensure_ascii=False))

elif command == "auth_status":
    auth_file = get_auth_file_path()
    print(json.dumps({"configured": bool(auth_file and os.path.isfile(auth_file))}))

elif command == "library":
    category = sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    order = sys.argv[4] or None if len(sys.argv) > 4 else None
    client = get_authenticated_yt()
    methods = {
        "playlists": client.get_library_playlists,
        "songs": client.get_library_songs,
        "artists": client.get_library_artists,
        "albums": client.get_library_albums,
        "subscriptions": client.get_library_subscriptions,
        "podcasts": client.get_library_podcasts,
        "channels": client.get_library_channels,
    }
    if category not in methods:
        raise ValueError("Unsupported library category")
    method = methods[category]
    if category == "playlists":
        result = method(limit=limit)
    else:
        result = method(limit=limit, order=order)
    print(json.dumps(result, ensure_ascii=False))

elif command == "rate":
    payload = json.loads(sys.stdin.read())
    client = get_authenticated_yt()
    rating = LikeStatus(payload["rating"])
    if payload["type"] in ("song", "album", "playlist"):
        if payload["type"] == "song":
            result = client.rate_song(payload["id"], rating)
        else:
            playlist_id = payload["id"]
            result = client.rate_playlist(playlist_id, rating)
    else:
        raise ValueError("Unsupported library item type")
    print(json.dumps(result, ensure_ascii=False))

elif command == "artist_subscription":
    payload = json.loads(sys.stdin.read())
    client = get_authenticated_yt()
    if payload["subscribe"]:
        result = client.subscribe_artist(payload["channelId"])
    else:
        result = client.unsubscribe_artists([payload["channelId"]])
    print(json.dumps(result, ensure_ascii=False))

elif command == "history":
    client = get_authenticated_yt()
    print(json.dumps(client.get_history(), ensure_ascii=False))

elif command == "history_remove":
    payload = json.loads(sys.stdin.read())
    client = get_authenticated_yt()
    result = client.remove_history_items(payload["feedbackTokens"])
    print(json.dumps(result, ensure_ascii=False))

elif command == "playlist":
    payload = json.loads(sys.stdin.read())
    client = get_authenticated_yt()
    playlist_id = payload["playlistId"]
    result = client.get_playlist(
        playlist_id,
        limit=payload.get("limit", 100),
        suggestions_limit=payload.get("suggestionsLimit", 0),
    )
    print(json.dumps(result, ensure_ascii=False))

elif command == "playlist_create":
    payload = json.loads(sys.stdin.read())
    client = get_authenticated_yt()
    result = client.create_playlist(
        payload["title"],
        payload.get("description", ""),
        privacy_status=payload.get("privacyStatus", "PRIVATE"),
        video_ids=payload.get("videoIds"),
    )
    print(json.dumps(result, ensure_ascii=False))

elif command == "playlist_delete":
    payload = json.loads(sys.stdin.read())
    result = get_authenticated_yt().delete_playlist(payload["playlistId"])
    print(json.dumps(result, ensure_ascii=False))

elif command == "playlist_edit":
    payload = json.loads(sys.stdin.read())
    result = get_authenticated_yt().edit_playlist(
        payload["playlistId"],
        title=payload.get("title"),
        description=payload.get("description"),
        privacyStatus=payload.get("privacyStatus"),
        moveItem=payload.get("moveItem"),
    )
    print(json.dumps(result, ensure_ascii=False))

elif command == "playlist_tracks_add":
    payload = json.loads(sys.stdin.read())
    result = get_authenticated_yt().add_playlist_items(
        payload["playlistId"],
        videoIds=payload["videoIds"],
    )
    print(json.dumps(result, ensure_ascii=False))

elif command == "playlist_tracks_remove":
    payload = json.loads(sys.stdin.read())
    result = get_authenticated_yt().remove_playlist_items(
        payload["playlistId"],
        payload["videos"],
    )
    print(json.dumps(result, ensure_ascii=False))

elif command == "podcast":
    payload = json.loads(sys.stdin.read())
    result = get_authenticated_yt().get_podcast(payload["playlistId"], limit=payload.get("limit", 100))
    print(json.dumps(result, ensure_ascii=False))

elif command == "channel":
    payload = json.loads(sys.stdin.read())
    result = get_authenticated_yt().get_channel(payload["channelId"])
    print(json.dumps(result, ensure_ascii=False))

elif command == "channel_episodes":
    payload = json.loads(sys.stdin.read())
    result = get_authenticated_yt().get_channel_episodes(payload["channelId"], payload["params"])
    print(json.dumps(result, ensure_ascii=False))

elif command == "episodes_playlist":
    payload = json.loads(sys.stdin.read())
    result = get_authenticated_yt().get_episodes_playlist(payload.get("playlistId", "RDPN"))
    print(json.dumps(result, ensure_ascii=False))

elif command == "album":
    browse_id = sys.argv[2]
    print(json.dumps(yt.get_album(browse_id), ensure_ascii=False))

elif command == "song":
    video_id = sys.argv[2]
    print(json.dumps(yt.get_song(video_id), ensure_ascii=False))

elif command == "stream":
    video_id = sys.argv[2]
    ydl_opts = {'format': 'bestaudio/best', 'quiet': True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
        print(json.dumps({"url": info['url']}, ensure_ascii=False))

elif command == "lyrics":
    video_id = sys.argv[2]
    try:
        watch_playlist = yt.get_watch_playlist(videoId=video_id)
        lyrics_id = watch_playlist.get('lyrics')
        if lyrics_id:
            lyrics = yt.get_lyrics(lyrics_id, timestamps=True)
            print(json.dumps(lyrics, ensure_ascii=False))
        else:
            print(json.dumps({"error": "No lyrics found"}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))

elif command == "watch":
    video_id = sys.argv[2] or None
    playlist_id = sys.argv[3] or None if len(sys.argv) > 3 else None
    limit = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else 25
    radio = len(sys.argv) > 5 and sys.argv[5].lower() == "true"
    shuffle = len(sys.argv) > 6 and sys.argv[6].lower() == "true"
    include_metadata = len(sys.argv) > 7 and sys.argv[7].lower() == "true"
    try:
        watch_playlist = yt.get_watch_playlist(
            videoId=video_id,
            playlistId=playlist_id,
            limit=limit,
            radio=radio,
            shuffle=shuffle,
        )
        result = watch_playlist if include_metadata else watch_playlist.get("tracks", [])
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps([]))

elif command == "charts":
    country = sys.argv[2] if len(sys.argv) > 2 else "ID"
    try:
        charts = yt.get_charts(country=country)
        print(json.dumps(charts, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))