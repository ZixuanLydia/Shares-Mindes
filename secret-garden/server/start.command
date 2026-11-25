#!/bin/zsh
cd -- "${0:A:h}/.."
python3 server/shared_garden.py --host 0.0.0.0 --open "$@"
