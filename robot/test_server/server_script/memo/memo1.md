ws.close(code=1008)은 무엇인지
future.set_exception() 이란
np.frombuffer이란

---

일단 코드를 읽으면서 이해해보기.

뭐 비동기 이벤트 루프라던가 경로 설정을 위해 필요한 라이브러리를 가져온다던가, 타입 힌트를 위한 UUID를 가져오고. UUID는 뭐지. uuid4()로 나오는게 str이 아니라 UUID인건가. 

아무튼 이미지 처리를 위한 cv2가 있고. cv2는 크기가 그렇게 크기 않은건가. 그리고 바이트 파일 응답을 위한 FileResponse도 가져오고.

그래서 어플리케이션 객체 만들어주고, 모델 가져와주면서, 파일 기준으로 outputs6 폴더 하나 만들어서 진행하는 형태가 되는거고. robot의 웹소켓은 단 하나만 받게 설계한거고, pending_images에 로봇쪽에 요청한 이미지요청들 저장용 딕셔너리 만드는거고.

capture_lock는 락인건 알겠는데 그냥 Lock 객체이면 with lock 되었을 때 동일한 Lock객체를 서야하는 겨웅에는 대기시키기 ㅜ이한거지? 이건 왜 그렇게 한거지. 이따 내려가서 바야할거같고, 이동은 회전과 상하좌우 이동만 가능하고, 이동할대 몇초만에 거기까지 가게 할 것인지를 보내는거고.

예를 들어서 첫번째에 3.0, 두번째에 1.0 을 보내면 두번째꺼가 4초만에 되는건가 아니면 1.0초까지 두번쨰 요청 거리에도달해야하고, 3.0초까지 첫번째까지 가야하는건가?

그리고 로봇으로 명령 전송하는건 그냥 공통 코루틴으로 만들어서 규격은 보통 request_id와 type 를 통해 어떤 명령을 할것인지 등을 주고, 연결 이나 RuntimeError은 뭔지 모르겠지만 그걸 받을 경우에는 로봇쪽 문제로 처리해주는거고. 그래서 매번 로봇 웹소켓 있는지 -> 송신 -> 송신중 문제를처리 하는 함수인거고.

app.websocket()의 경우에는 로봇이 ws프로토콜로ㅗ 접속할 대 /ws/robot를 사용하는거고 메인 스레드 전역 robot_ws를 보았을 때 그게 잇으면 연결 하자마자 끊어주고. 애초에 accept하기 전에 왜 체크를 안하는건지 잘 모르겠네.

ws.close(code=1008)은 뭘 말하는거지.

아무튼 바로 끊어주고. 

이미 저ㅗㄴ재하는 연결 없으면 잡아놔주고.

그리고 image_id를 초기화해서 작업중인 id도 없애주고. image_id가 작업중인 이미지인거 맞지?

그리고나서부터 여기에서 해당 소켓으로 들어오는 모든 데이터는 robot_socket()에서 관리하느 형태가 되는거고.

그래서 만약 http로 type: "websocket.disconnect"로 보냈을 때 다시 돌아오는 문자열이 "websocket.disconnect" 라면 반복문 끝내고 웹소켓 끊어주는 방식이 되는거고, 이미지들도 future을 기준으로 모두 exception으로 처리해주고. ws의 경우에는 해당 핸들러인 robot_socket가 처리되면 알아서 gc로 처리되거나 한다고 생각하면 되는건가. 다로 close 해주진 않는 느낌이네. 

그리고 응답인경우, text가 있으면 보통 json으로 받은다음에 image_meta의 ㄱ경우에는 image_id를 설정하고, error인 경우에는 해당 Future을 예외처리 해주는 느낌인거고. RuntimeError이 어떤 에러인거지?

그리고 image_meta에서 image_id를 받아서 뭘 하는거지. 그냥 아무것도 안하는거같은데.

그리고 만약 text가 비어있고 bytes가 채워져있다면 메시지에서 bytes를 받은다음에 해당 요청 처리중인 Future을 받아서 거기에 result로 그 바이트를 넣는거고. jpeg_bytes의 타입은 뭐가 되는거고, future.set_result를 하면 futuere의 상태가 종료된 객체 취급 되는건가? 상태가 어떻게 변하는거지. 그리고 ws.receive에는 원래 type, text, bytes가 들어가는게 아니라 우리가 client에서도 그 키값을 사용할거여서 type, text, bytes를 사용하는거지?

그리고 클라이언트쪽에서 연결을 끊거나 text가 들어왓는데 json형식이 아니면 에러를 내는거고.

이동의 경우에는 uuid4() 에서 나온 객체에 hex로 문자열을 뽑는건가?

그리고 command.model_dump는 BaseModel의 메서드로 dict를 반환하는 메서드인거같고, request_id를 뽑아서 로봇에게 주면 해당 핸들러에서는 응답은 기다리지 않고, 특별한 에러가 없으면 그냥 잘 보내졌다 까지만 보내주는거고, stop의 경우에도 동일하게 이전에 만든 함수를 이용해서 쉽게 보내게 해주는거고.

그리고 yoo 객탐지를 위한 함수를 하나 만들었는데 bytes같은 타입을 사용했네. bytes 타입이 뭐지.

그리고 np.frombuffer이 뭔지 잘 모르겠는데 bytes가 애초에 버퍼에서 가져올 수 있게 만든 타입이라서 np.frombuffer을 쓰는건가. 그리고 image_array의 경우에는 ndarray가 되는거고? frame의 경우에는 immdecode를 이요해서 뭔가 행렬? 뭔가 변형하는거같은데 cv2.imdecode(image_array, cv2.IMREAD_COLOR)에서 뭘 하고 뭘 반환하는건지 모르겠네. 아무튼 이걸 반환한당므에 imwrite를 ㅣ요해서 경로에 frame를 저장하고. OUTUPUT_DIR은 파일 기준으로 한번 올라간다음에 output6/ 로 만들어둔 디렉토리이고, 아마 이 함수는 http 조회 요청에 대해서 Future가 끝낫는지 확인하고 그 Future에서 byees와 request_id를 뽑아서 호출하는 함수가 되겠지.


그리고 yolo에서 predict를 하는데 verbose는 뭔가 설명이 콘솔에 나온다는 의미인건가. 그리고 반값이 뭐지. list[Result] 형태가 되려나

이후에는 하나만 넣었으니까 하나만 [0]으로 뽑아서 detections에 뽑은 클래스나 위치, 확신도를 보기 위해서 사용하고, class_id를 이용해서 뽑고, result.names의 겨웅에는 해당 모델에 등록되어있는 class_id: name가 되는건가. box에서 conf를 뽑은다음에 저게 아마 tensor일테니가 숫자형으로 뽑은다음에 float()를 하는건가. item()과 float()를 모두 하는 이유가 뭐지. 그리고 round(4) 로 적당하게 만들어주고.

bbox_xyxy를 이용해서 리스트로 값들 뽑은다음에 그 위치들 (아마 0-1 정규화딘 값)을 뽑아서 리스트로 뽑아주는거네.

그리고나서 annotated 그 결과를 plot()로 뽑으면 bbox/conf 등이 쳐져있는 이미지가 만들어지는건가? 그래서 그걸 아까 original과 함게 result로 두는거고. 

위에서 준비한 작업을 사용한느 post /capture-detect의 경우에는 capture_lock를 통해서 한번에 2개 이상의 이미지 요청을 웹소켓에 넣고 모델로 처리하지 못하게 하는거고. 

그리고 현재 사용중인 asyncio 모듈에서 이벤트루프를 가져온다음에 거기에서 돌아갈 Future 객체를 하나 받는거고, request_id를 만들어서 거기에 Future 객체를 등록하는 느낌으로 사용해주고, 그리고 send_to_robot을 이용햇거 capture 요청을 보내면 로봇쪽에서 알아서 바이트를 보내준다는 느낌이 될거같고, jpeg_bytes는 asyncio.wait_for(future)을 이용해서 robot_socket()에서 받을 수 있게 해주는거고.

그리고 detect_image를 이용해서 작업을 하는거네. 보니까 to_thread에 콜백과 함꼐 다음에 인자를 넣어ㅓ주는 느낌으로 쓰는건가보네. 이런 패턴 은근히 보인다.

그리고 asyncio에서 타임아웃이라던가 ConnectionError같은걸 넣는데 이것들은 무슨 에러인거지?

이무튼 이런 작업들 끝마녀 pengind_images에 이미지데이터들이 있을테니까. 아마 cv2로 가공된 어떤 타입의 이미지. 그래서 그걸 뽑아주는 pending_isages에서 뽑아주고. 우리는 이미지까지 보내진 않고 그냥 저장된 위치같은것만 보내서 나중에 또 클라이언트에서 해당 url을 이용해서 조회하는 형태로 사용하게 되겠네.

그리고 /results/requset_id를 이용해서 아가 보내준 image_url의 request_id를 통해서 해당 이미지 _result.jpg를 받으면 되는거고. 거기에 FileResponse를 쓰면 그 뭐였었지. 일반 메시지 발고 무슨 타입의 응답 있었는데. multipart 형식으로 보내지는 느낌이 되는건가? 이건 보통 파일 경로와 미디어 타입을 보태며 어느정도 맞춰서 응답이 가는건가. 

그리고 health는 별거 없고.