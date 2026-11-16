duration_sec의 경우에는 명령을 유지하는 시간이 되는거고, 그러면 설정한 시간만큼 해당 작업을 수행하는 방식이 되는거고.

websocket.disconnect은 asgi가 서버에 전달하는 이벤트라는게 uvicorn에서 보내주는건가.

pending_images는 Future을 저장하고 bbox_xyxy는 이미지의 픽셀 좌표이고, 0-1 사이가 아닐 수 있는거고.

ws.close()의 경우에는 상대에게 보내주는 코드가 되는거고. 1008은 정책에 안맞는다 -> 2개 이상 안된다 라는 의미인거고.

ws에서는 accept를 통해서 먼저 http를 받은다음에 http upgrade를 받아서 이후에 ws.accept를 이용해서 연결을 수립하고 나서 그 연결에 robot_ws를 영구적으로 저장하기 전에 한번 검사하는거구나. 연결 끊음의 이유를 설명하기 위해서 연결을 한다고 생각할 수도 있는거고.

message의 경우에는 asgi 메시지 딕셔너리라는게 약간 이미 정해져있는 형식인 느낌인거구나. js의 fetch의 response 객체같이. 그래서 asgi 메시지 딕셔너리로 받은 텍스트나 바이트를 뽑아서 사용하는거고.

메시지 받으면 websocket.recieve같은 형식이 되는거고. 연결 끊으면 websocket.disconnect가 되는거네.

image_id를 저장하는게 image_id만 저장하고 끝이 아닌건가. 아마 최초로 요청했을 때에 로봇쪽에서 먼저 image_meta를 보내서 전역 image_id를 저장한다음에 이후에 바이트 처리할 때 해당 image_id를 받는거구나. 그러면 서버에서 이미지를 처리하기 전에 먼저 image_meta를 받아야하는거고. 그래야 다음에 future을 조회해서 거기에 넣어주는 방식이 되는거고. 일단 pending_images에 image_id: future가 되는거고, lock을 걸어놓고, 이미지 캡처를 받고, image_meta를 받고, 다시 iamge바이너리를 받아서 처리하면 wait_for이 끝나서 처리되는 느낌인거고.

future은 이미ㅈ를 받고, done()를 하면 안에 속성으로 들고있을 resulut가으게 있으면 True 같은게 되는 느낌인거고. 

future은 보통 asyncio.wait_for 같은걸로 취급하는건가? 그냥 await future 같은식으로는 안쓰나봐?

뭔가 future, task, corotine 타입 등이 좀 햇갈리기는 하네.

bytes도 거의 str하고 비슷한 느낌이 있는거같고, data 255 정수들의 연속 표현이 되는늮ㅁ인거네. 

글서 이것도 하나의 배열처럼 쓸 수 있는거고, 그걸 또 array로 변경하면 아마 1차원 numpy 배열이 되는 느낌이려나.

그리고나서 cvdecode를 통해서 3차원 h, w 배열을 만드는건데 1차원 배열을 뭘 기준으로 3차원 배열로 만들 수 있는거지?

cv2는 opencv인건 아는데 뭐때무넹 그렇게 용량이 큰건지 잘 모르겠네.

그리고 이제 client로 가면 되겠다.