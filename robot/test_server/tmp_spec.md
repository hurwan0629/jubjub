# 임시 통신 규격
```json
// server
{
  "type": "move",
  "command_id": "cmd-{uuid}",
  "data": {
    "yx": 0.1,
    "vt": 0.0,
    "wz": 0.0
  }
}
```

```json
// robot
{
  "type": "move",
  "command_id": "cmd-{uuid}",
  "status": "command_published"
}
```

```json
// robot status sending each period
{
  "type": "robot_status",
  "robot": ["idle", "moving", "{x: 0.0, y: 0.0}"]
}
```