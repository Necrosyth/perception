#!/bin/sh
# Continuous H.264 MP4 recorder for the Surveillance Intelligence Lab.
# Runs ffmpeg once per camera, pulling the SAME go2rtc restream the dashboard
# tiles and perception consume (rtsp://media:8554/<name>), and writes seekable
# fragmented MP4 segments into /recordings/<name>/ — served back to the
# dashboard by nginx `location /recordings/`.
#
# It is a plain POSIX-sh loop (this image is busybox) so it restarts ffmpeg if
# it ever exits, and it never exits on its own. Segments rotate every 60s so a
# review segment maps to at most two small files.
set -eu

: "${GO2RTC_RTSP_PORT:=8554}"
: "${RECORD_DIR:=/recordings}"
: "${SEGMENT_SECONDS:=60}"

# Cameras to record, one per line: <restream-name>
CAMERAS="loading_dock
warehouse_east"

mkdir -p "$RECORD_DIR"

record_one() {
    name="$1"
    dir="$RECORD_DIR/$name"
    mkdir -p "$dir"
    : > "/tmp/.rec_$name"
    while :; do
        # -movflags +frag_keyframe+empty_moov => browser-playable fragmented MP4
        # that nginx can byte-range serve for <video> scrubbing.
        ffmpeg -hide_banner -loglevel warning \
            -rtsp_transport tcp \
            -i "rtsp://media:$GO2RTC_RTSP_PORT/$name" \
            -map 0:v:0 -map 0:a? \
            -c:v copy -c:a aac \
            -f segment -segment_time "$SEGMENT_SECONDS" -segment_format mp4 \
            -strftime 1 -reset_timestamps 1 \
            -movflags +frag_keyframe+empty_moov \
            -err_detect explode \
            "$dir/%Y-%m-%d_%H-%M-%S.mp4"
        sleep 2
    done
}

# Start one ffmpeg recorder per camera, keep all running.
pids=""
for cam in $CAMERAS; do
    record_one "$cam" &
    pids="$pids $!"
done

# Reap children if this shell gets a signal; otherwise stay alive forever.
trap 'kill $pids 2>/dev/null' TERM INT
wait