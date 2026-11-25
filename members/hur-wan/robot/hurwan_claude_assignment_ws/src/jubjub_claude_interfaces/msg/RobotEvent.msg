# Result event that must reach the server (stored in the bridge outbox until acked).
string type                       # point_arrived | patrol_end | detection | pick_result | error
builtin_interfaces/Time stamp     # when it actually happened (occurred_at)
int64 patrol_id                   # -1 = null
int32 seq                         # point_arrived
string result                     # arrived|skipped / completed|stopped|aborted / collected|failed
string reason
string detection_id               # robot-generated UUID (detection, pick_result)
string material
float32 confidence
float64 x
float64 y
string code                       # error code
string action                     # error: returning | stopped
string detail
sensor_msgs/CompressedImage image # detection photo (jpeg)
