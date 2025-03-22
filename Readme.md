rd -f  /s /q .git
docker build -t nodepython .
docker run -p 3000:3000 nodepython