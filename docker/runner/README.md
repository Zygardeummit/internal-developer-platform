# Build runner

`idp-build-runner:local` contains Node.js and Git for isolated repository builds.
Build it with `docker compose build runner`. Each executor run creates one
unmounted, short-lived container from this image; repository files never mount
into the API host.
