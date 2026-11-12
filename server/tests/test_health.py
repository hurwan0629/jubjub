def test_health_ok(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "db": "ok"}


def test_health_db_down(client, fake_db):
    fake_db.fail = True
    res = client.get("/health")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == 503
    assert body["code"] == "db_unavailable"
    assert "DATABASE_URL" in body["message"]
