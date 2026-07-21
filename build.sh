source .env
docker-compose build frontend
docker-compose build backend

docker-compose down -v  frontend
docker-compose up -d  frontend
docker-compose down -v  backend
docker-compose up -d  backend
# docker-compose up -d --force-recreate backend
# docker-compose down -v && docker-compose up -d
