# One YOLO detection from a single RGB+Depth frame (camera optical frame = header.frame_id of the array).
int32 class_id
string class_name          # general | plastic | can | glass (same strings as server "material")
float32 confidence
int32[4] bbox              # pixel [x1, y1, x2, y2]
float32 depth_sample_ratio # valid (non-zero) depth pixels / sampled pixels in the bbox center ROI
bool has_depth
float32 depth_m            # median depth of the ROI (only if has_depth)
bool has_point
geometry_msgs/Point point  # 3D point in camera optical frame (only if has_point)
