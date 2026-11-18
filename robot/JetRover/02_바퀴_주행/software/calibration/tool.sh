#!/bin/zsh
source /home/ubuntu/.zshrc
gnome-terminal -- bash -c "python3 /home/ubuntu/software/calibration/calibration.py; exec bash"
gnome-terminal -- bash -c "python3 /home/ubuntu/software/calibration/main.py; exec bash" 


