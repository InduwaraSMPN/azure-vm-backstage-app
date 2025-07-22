cd ~ && source venv/bin/activate && openhands

sudo lsof -i :<PORT>
sudo kill <PID>
sudo lsof -i :3000

sudo systemctl stop docker
sudo systemctl start docker