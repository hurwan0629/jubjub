"""앱의 Park 타입과 같은 검색 응답을 정의해요."""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ParkSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LatLng(ParkSchema):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class ParkBounds(ParkSchema):
    south_west: LatLng
    north_east: LatLng


class ParkArea(ParkSchema):
    outer: list[LatLng] = Field(min_length=4)
    holes: list[list[LatLng]] = Field(default_factory=list)


class ParkResponse(ParkSchema):
    id: str
    name: str
    address: str
    distance: str
    has_manager: bool = False  # 이미 승인된 담당 관리자가 있는 공원 (공원 변경 요청에서 고를 수 없어요)
    bounds: ParkBounds
    area: ParkArea
