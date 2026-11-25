# Mission state published by jubjub_manager. "state" uses the server protocol values.
std_msgs/Header header
string state                      # idle | working | returning | error
string phase                      # internal: idle | to_point | retry_wait | approaching | picking | to_home | stopped
int64 patrol_id                   # -1 when none
int32 current_seq                 # -1 when none
int32 total_points
geometry_msgs/Pose2D pose         # pose reported to the server (virtual pose in sandbox mode)
string last_error
