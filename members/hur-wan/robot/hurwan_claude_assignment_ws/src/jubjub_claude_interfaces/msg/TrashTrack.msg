uint32 track_id
int32 class_id
string class_name
float32 confidence             # max confidence seen for this track
geometry_msgs/Point position   # in TrashTrackArray.header.frame_id (global frame, e.g. odom or map)
uint32 hits                    # number of frames this track was matched
bool stable                    # hits >= min_hits (worth acting on)
builtin_interfaces/Time last_seen
