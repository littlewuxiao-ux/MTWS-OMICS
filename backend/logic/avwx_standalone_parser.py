from __future__ import annotations
from calendar import monthrange
from collections.abc import Callable
from contextlib import suppress
from copy import copy
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from itertools import permutations
from textwrap import wrap
from typing import TYPE_CHECKING
from typing import TYPE_CHECKING, Any
import asyncio as aio
import datetime as dt
import math
import re

# ==========================================
# 补充/Mock
# ==========================================
def valid_station(code):
    return code
    
def uses_na_format(code):
    if not code: return True
    if len(code) == 3: return True
    return code[0] in ("K", "C", "P")

class MockNoaa:
    def __init__(self, *args, **kwargs):
        pass
    async def async_fetch(self, *args, **kwargs):
        return None

Noaa = MockNoaa

class LazyLoad:
    def __init__(self, name):
        self.name = name
    def __getitem__(self, item):
        return 'Unknown'
        
class ManagedReport:
    def __init__(self, code):
        self.code = code
        self.station = type('Station', (), {'country': 'US', 'name': 'Unknown', 'elevation_ft': 0, 'coord': None})()
        self.issued = None
        self.source = None
    async def _update(self, reports, issued, disable_post):
        return False
        
def get_service(*args):
    def inner(*args): return MockNoaa()
    return inner


# ========================================
# 婧愭枃浠?: exceptions.py
# ========================================
"""Contains avwx custom exceptions."""


def exception_intercept(exception: Exception, **extra: dict) -> None:  # noqa: ARG001
    """Interceptor to overwrite unhandled exceptions in high-failure locations."""
    raise exception


class BadStation(Exception):
    """Station does not exist."""


class InvalidRequest(Exception):
    """Unable to fetch data."""


class SourceError(Exception):
    """Source servers returned an error code."""


class MissingExtraModule(ModuleNotFoundError):
    """Inform user that an extra install module is needed."""

    def __init__(self, extra: str):
        super().__init__(f"Install avwx-engine[{extra}] to use this feature")


# ========================================
# 婧愭枃浠?: static/py
# ========================================
"""Core static values for internal and external use.

METAR and TAF reports come in two variants depending on the station's
location: North American & International. This affects both element
parsing and inferred units of measurement. AVWX determines this by
looking at the station's ICAO value.
"""

NA_REGIONS = (
    "C",
    "K",
    "P",
    "T",
)
"""Station Location Identifiers - North American formatting"""

IN_REGIONS = (
    "A",
    "B",
    "D",
    "E",
    "F",
    "G",
    "H",
    "L",
    "N",
    "O",
    "R",
    "S",
    "U",
    "V",
    "W",
    "Y",
    "Z",
)
"""Station Location Identifiers - International formatting"""

# The Central American region is split. Therefore we need to use the first two letters
M_NA_REGIONS = (
    "MB",
    "MM",
    "MT",
    "MY",
)
"""Central America Station Location Identifiers - North American formatting"""

M_IN_REGIONS = (
    "MD",
    "MG",
    "MH",
    "MK",
    "MN",
    "MP",
    "MR",
    "MS",
    "MU",
    "MW",
    "MZ",
)
"""Central America Station Location Identifiers - International formatting"""

NA_UNITS = {
    "altimeter": "inHg",
    "altitude": "ft",
    "accumulation": "in",
    "temperature": "C",
    "visibility": "sm",
    "wind_speed": "kt",
}
"""North American variant units"""

IN_UNITS = {
    "altimeter": "hPa",
    "altitude": "ft",
    "accumulation": "in",
    "temperature": "C",
    "visibility": "m",
    "wind_speed": "kt",
}
"""International variant units"""

WIND_UNITS = {
    "KT": "kt",
    "KTS": "kt",
    "MPS": "m/s",
    "KMH": "km/h",
    "MPH": "mi/h",
}
"""Expected unit postfixes for wind elements in order of frequency"""

FLIGHT_RULES = (
    "VFR",
    "MVFR",
    "IFR",
    "LIFR",
)
"""List of flight rules abbreviations"""

CLOUD_LIST = (
    "FEW",
    "SCT",
    "BKN",
    "OVC",
)
"""List of cloud layer abbreviations"""

CARDINALS = {
    "N": 360,
    "NORTH": 360,
    "NE": 45,
    "E": 90,
    "EAST": 90,
    "SE": 135,
    "S": 180,
    "SOUTH": 180,
    "SW": 225,
    "W": 270,
    "WEST": 270,
    "NW": 315,
}
"""Dictionary of cardinal direction values"""

CARDINAL_DEGREES = {
    "NNE": 22.5,
    "NE": 45,
    "ENE": 67.5,
    "E": 90,
    "ESE": 112.5,
    "SE": 135,
    "SSE": 157.5,
    "S": 180,
    "SSW": 202.5,
    "SW": 225,
    "WSW": 247.5,
    "W": 270,
    "WNW": 292.5,
    "NW": 315,
    "NNW": 337.5,
    "N": 0,
}
"""Dictionary of tertiary cardinal directions to degree values with North at 0"""

WX_TRANSLATIONS = {
    "BC": "Patchy",
    "BL": "Blowing",
    "BR": "Mist",
    "DR": "Low Drifting",
    "DS": "Duststorm",
    "DU": "Wide Dust",
    "DZ": "Drizzle",
    "FC": "Funnel Cloud",
    "FG": "Fog",
    "FU": "Smoke",
    "FZ": "Freezing",
    "GR": "Hail",
    "GS": "Small Hail",
    "HZ": "Haze",
    "IC": "Ice Crystals",
    "MI": "Shallow",
    "PL": "Ice Pellets",
    "PO": "Dust Whirls",
    "PR": "Partial",
    "PY": "Spray",
    "RA": "Rain",
    "SA": "Sand",
    "SG": "Snow Grains",
    "SH": "Showers",
    "SN": "Snow",
    "SQ": "Squall",
    "SS": "Sandstorm",
    "SY": "Spray",
    "TS": "Thunderstorm",
    "UP": "Unknown Precip",
    "VA": "Volcanic Ash",
    "VC": "Vicinity",
}
"""Dictionary associating WX codes with descriptions"""

CLOUD_TRANSLATIONS = {
    "OVC": "Overcast layer at {0}{1}",
    "BKN": "Broken layer at {0}{1}",
    "SCT": "Scattered clouds at {0}{1}",
    "FEW": "Few clouds at {0}{1}",
    "VV": "Vertical visibility up to {0}{1}",
    "CLR": "Sky Clear",
    "SKC": "Sky Clear",
    "AC": "Altocumulus",
    "ACC": "Altocumulus Castellanus",
    "AS": "Altostratus",
    "CB": "Cumulonimbus",
    "CC": "Cirrocumulus",
    "CI": "Cirrus",
    "CS": "Cirrostratus",
    "CU": "Cumulus",
    "FC": "Fractocumulus",
    "FS": "Fractostratus",
    "NS": "Nimbostratus",
    "SC": "Stratocumulus",
    "ST": "Stratus",
    "TCU": "Towering Cumulus",
    None: "Unknown",
}
"""Dictionary associating cloud layer and cloud codes with descriptions"""

SPOKEN_UNITS = {
    "sm": "mile",
    "mi": "mile",
    "km": "kilometer",
    "C": "Celsius",
    "F": "Fahrenheit",
    "kt": "knot",
}
"""Units required to be translated in order to be spoken properly"""

NUMBER_REPL = {
    ".": "point",
    "-": "minus",
    "M": "minus",
    "0": "zero",
    "1": "one",
    "2": "two",
    "3": "three",
    "4": "four",
    "5": "five",
    "6": "six",
    "7": "seven",
    "8": "eight",
    "9": "nine",
}
"""Dictionary associating algebraic signs with their spoken version"""

FRACTIONS = {"1/4": "one quarter", "1/2": "one half", "3/4": "three quarters"}
"""Dictionary associating fraction strings with their spoken version"""

SPECIAL_NUMBERS = {
    "CAVOK": (9999, "ceiling and visibility ok"),
    "VRB": (None, "variable"),
    "CLM": (0, "calm"),
    "SFC": (0, "surface"),
    "GND": (0, "ground"),
    "STNR": (0, "stationary"),
    "LTL": (0, "little"),
    "FRZLVL": (None, "freezing level"),
    "UNL": (999, "Unlimited"),
}
"""Dictionary associating special number values with their spoken version"""

REMARKS_ELEMENTS = {
    "$": "ASOS requires maintenance",
    "AO1": "Automated with no precipitation sensor",
    "AO2": "Automated with precipitation sensor",
    "ADVISORY": "Advisory only. Do not use for flight planning",
    "BINOVC": "Breaks in Overcast",
    "FZRANO": "Freezing rain information not available",
    "NOSPECI": "No SPECI reports taken",
    "P0000": "Trace amount of rain in the last hour",
    "PNO": "Precipitation amount not available",
    "PRESFR": "Pressure Falling Rapidly",
    "PRESRR": "Pressure Rising Rapidly",
    "PWINO": "Precipitation identifier information not available",
    "RVRNO": "Runway Visual Range missing",
    "SLPNO": "Sea level pressure not available",
    "SOG": "Snow on the ground",
    "TSNO": "Thunderstorm information not available",
}
"""Static remarks translation elements"""

REMARKS_GROUPS = {"ACFT MSHP": "Aircraft mishap"}
"""Static remarks translation groups"""


# ========================================
# 婧愭枃浠?: static/metar.py
# ========================================
"""METAR static values."""

METAR_RMK = [
    " BLU",
    " BLU+",
    " WHT",
    " GRN",
    " YLO",
    " AMB",
    " RED",
    " ALL",
    " BECMG",
    " TEMPO",
    " INTER",
    " NOSIG",
    " RMK",
    " WIND",
    " QFE",
    " QFF",
    " INFO",
    " RWY",
    " CHECK",
]
"""Strings signifying the start of the remarks section of a METAR"""


# ========================================
# 婧愭枃浠?: static/taf.py
# ========================================
"""TAF static values."""

TURBULENCE_CONDITIONS = {
    "0": "None",
    "1": "Light turbulence",
    "2": "Occasional moderate turbulence in clear air",
    "3": "Frequent moderate turbulence in clear air",
    "4": "Occasional moderate turbulence in clouds",
    "5": "Frequent moderate turbulence in clouds",
    "6": "Occasional severe turbulence in clear air",
    "7": "Frequent severe turbulence in clear air",
    "8": "Occasional severe turbulence in clouds",
    "9": "Frequent severe turbulence in clouds",
    "X": "Extreme turbulence",
}
"""Dictionary associating turbulence report IDs with descriptions"""

ICING_CONDITIONS = {
    "0": "No icing",
    "1": "Light icing",
    "2": "Light icing in clouds",
    "3": "Light icing in precipitation",
    "4": "Moderate icing",
    "5": "Moderate icing in clouds",
    "6": "Moderate icing in precipitation",
    "7": "Severe icing",
    "8": "Severe icing in clouds",
    "9": "Severe icing in precipitation",
}
"""Dictionary associating icing report IDs with descriptions"""

PRESSURE_TENDENCIES = {
    "0": "Increasing, then decreasing",
    "1": "Increasing, then steady",
    "2": "Increasing steadily or unsteadily",
    "3": "Decreasing or steady, then increasing",
    "4": "Steady",
    "5": "Decreasing, then increasing",
    "6": "Decreasing, then steady",
    "7": "Decreasing steadily or unsteadily",
    "8": "Steady or increasing, then decreasing",
    "9": "Unknown",
}
"""Dictionary associating pressure change IDs with descriptions"""

TAF_RMK = [
    "RMK ",
    "AUTOMATED ",
    "COR ",
    "AMD ",
    "LAST ",
    "FCST ",
    "CANCEL ",
    "CHECK ",
    "WND ",
    "MOD ",
    " BY",
    " QFE",
    " QFF",
]
"""Strings signifying the start of the remarks section of a TAF"""

TAF_NEWLINE = ["INTER", "BECMG", "TEMPO"]
"""Strings signifying the start of a new TAF time period"""

TAF_NEWLINE_STARTSWITH = ["FM", "PROB"]
"""Addendum to TAF_NEWLINE but string startswith and the rest are only digits"""


# ========================================
# 婧愭枃浠?: structs.py
# ========================================
"""Contains dataclasses to hold report data."""

# stdlib


if TYPE_CHECKING:
    from datetime import datetime

# module

try:
    from typing import Self
except ImportError:
    from typing_extensions import Self
try:
    from shapely.geometry import Point, Polygon  # type: ignore
except ModuleNotFoundError:
    Point, Polygon = None, None

AIRCRAFT = LazyLoad("aircraft")


@dataclass
class Aircraft:
    code: str
    type: str

    @classmethod
    def from_icao(cls, code: str) -> Self:
        """Load an Aircraft from an ICAO aircraft code."""
        try:
            return cls(code=code, type=AIRCRAFT[code])
        except KeyError as key_error:
            msg = f"{code} is not a known aircraft code"
            raise ValueError(msg) from key_error


@dataclass
class Units:
    accumulation: str
    altimeter: str
    altitude: str
    temperature: str
    visibility: str
    wind_speed: str

    @classmethod
    def international(cls) -> Self:
        """Create default internation units."""
        return cls(**IN_UNITS)

    @classmethod
    def north_american(cls) -> Self:
        """Create default North American units."""
        return cls(**NA_UNITS)


@dataclass
class Number:
    repr: str
    value: int | float | None
    spoken: str


@dataclass
class Fraction(Number):
    numerator: int
    denominator: int
    normalized: str


@dataclass
class Timestamp:
    repr: str
    dt: datetime | None


@dataclass
class Code:
    repr: str
    value: str

    @classmethod
    def from_dict(
        cls,
        key: str | None,
        codes: dict[str, str],
        *,
        default: str | None = None,
        error: bool = True,
    ) -> Self | None:
        """Load a code from a known key and value dict."""
        value: str | None
        if not key:
            return None
        try:
            value = codes[key]
        except KeyError as exc:
            if error:
                msg = f"No code found for {key}"
                raise KeyError(msg) from exc
            value = default
        return cls(key, value or "Unknown")

    @classmethod
    def from_list(
        cls,
        keys: str | None,
        codes: dict[str, str],
        *,
        exclusive: bool = False,
    ) -> list[Self]:
        """Load a list of codes from string characters."""
        if not keys:
            return []
        out = []
        for key in keys.strip():
            if value := codes.get(key):
                out.append(cls(key, value))
            elif exclusive:
                return []
        return out


@dataclass
class Coord:
    lat: float
    lon: float
    repr: str | None = None

    @property
    def pair(self) -> tuple[float, float]:
        return self.lat, self.lon

    @property
    def point(self) -> Point:
        if Point is None:
            extra = "shape"
            raise MissingExtraModule(extra)
        return Point(self.lat, self.lon)

    @staticmethod
    def to_dms(value: float) -> tuple[int, int, int]:
        """Convert a coordinate decimal value to degree, minute, second."""
        minute, second = divmod(abs(value) * 3600, 60)
        degree, minute = divmod(minute, 60)
        if value < 0:
            degree *= -1
        return int(degree), int(minute), int(second)


@dataclass
class Cloud:
    repr: str
    type: str | None = None
    base: int | None = None
    top: int | None = None
    modifier: str | None = None


@dataclass
class RunwayVisibility:
    repr: str
    runway: str
    visibility: Number | None
    variable_visibility: list[Number]
    trend: Code | None


@dataclass
class Location:
    repr: str
    station: str | None
    direction: Number | None
    distance: Number | None


@dataclass
class PressureTendency:
    repr: str
    tendency: str
    change: float


@dataclass
class FiveDigitCodes:
    maximum_temperature_6: Number | None = None  # 1
    minimum_temperature_6: Number | None = None  # 2
    pressure_tendency: PressureTendency | None = None  # 5
    precip_36_hours: Number | None = None  # 6
    precip_24_hours: Number | None = None  # 7
    sunshine_minutes: Number | None = None  # 9


@dataclass
class RemarksData(FiveDigitCodes):
    codes: list[Code] = field(default_factory=list)
    dewpoint_decimal: Number | None = None
    maximum_temperature_24: Number | None = None
    minimum_temperature_24: Number | None = None
    precip_hourly: Number | None = None
    sea_level_pressure: Number | None = None
    snow_depth: Number | None = None
    temperature_decimal: Number | None = None


@dataclass
class ReportData:
    raw: str
    sanitized: str
    station: str | None
    time: Timestamp | None
    remarks: str | None


@dataclass
class SharedData:
    altimeter: Number | None
    clouds: list[Cloud]
    flight_rules: str
    other: list[str]
    visibility: Number | None
    wind_direction: Number | None
    wind_gust: Number | None
    wind_speed: Number | None
    wx_codes: list[Code]


@dataclass
class MetarData(ReportData, SharedData):
    dewpoint: Number | None
    relative_humidity: float | None
    remarks_info: RemarksData | None
    runway_visibility: list[RunwayVisibility]
    temperature: Number | None
    wind_variable_direction: list[Number]
    density_altitude: int | None = None
    pressure_altitude: int | None = None


@dataclass
class TafLineData(SharedData):
    end_time: Timestamp | None
    icing: list[str]
    probability: Number | None
    raw: str
    sanitized: str
    start_time: Timestamp | None
    transition_start: Timestamp | None
    turbulence: list[str]
    type: str
    wind_shear: str | None
    wind_variable_direction: list[Number] | None


@dataclass
class TafData(ReportData):
    forecast: list[TafLineData]
    start_time: Timestamp | None
    end_time: Timestamp | None
    is_amended: bool
    is_correction: bool
    max_temp: str | None = None
    min_temp: str | None = None
    alts: list[str] | None = None
    temps: list[str] | None = None
    remarks_info: RemarksData | None = None


@dataclass
class ReportTrans:
    altimeter: str
    clouds: str
    wx_codes: str
    visibility: str


@dataclass
class MetarTrans(ReportTrans):
    dewpoint: str
    remarks: dict
    temperature: str
    wind: str


@dataclass
class TafLineTrans(ReportTrans):
    icing: str
    turbulence: str
    wind: str
    wind_shear: str


@dataclass
class TafTrans:
    forecast: list[TafLineTrans]
    max_temp: str
    min_temp: str
    remarks: dict


@dataclass
class Turbulence:
    severity: str
    floor: Number | None = None
    ceiling: Number | None = None


@dataclass
class Icing(Turbulence):
    type: str | None = None


@dataclass
class PirepData(ReportData):
    aircraft: Aircraft | str | None = None
    altitude: Number | str | None = None
    clouds: list[Cloud] | None = None
    flight_visibility: Number | None = None
    icing: Icing | None = None
    location: Location | None = None
    other: list[str] | None = None
    temperature: Number | None = None
    turbulence: Turbulence | None = None
    type: str | None = None
    wx_codes: list[Code] | None = None


@dataclass
class AirepData(ReportData):
    pass


@dataclass
class Bulletin:
    repr: str
    type: Code
    country: str
    number: int


@dataclass
class Movement:
    repr: str
    direction: Number | None
    speed: Number | None


MIN_POLY_SIZE = 2


@dataclass
class AirSigObservation:
    type: Code | None
    start_time: Timestamp | None
    end_time: Timestamp | None
    position: Coord | None
    floor: Number | None
    ceiling: Number | None
    coords: list[Coord]
    bounds: list[str]
    movement: Movement | None
    intensity: Code | None
    other: list[str]

    @property
    def poly(self) -> Polygon | None:
        if Polygon is None:
            extra = "shape"
            raise MissingExtraModule(extra)
        return Polygon([c.pair for c in self.coords]) if len(self.coords) > MIN_POLY_SIZE else None


@dataclass
class AirSigmetData(ReportData):
    bulletin: Bulletin
    issuer: str
    correction: str | None
    area: str
    type: str
    start_time: Timestamp | None
    end_time: Timestamp | None
    body: str
    region: str
    observation: AirSigObservation | None
    forecast: AirSigObservation | None


@dataclass
class Qualifiers:
    repr: str
    fir: str
    subject: Code | None
    condition: Code | None
    traffic: Code | None
    purpose: list[Code]
    scope: list[Code]
    lower: Number | None
    upper: Number | None
    coord: Coord | None
    radius: Number | None


@dataclass
class NotamData(ReportData):
    number: str | None
    replaces: str | None
    type: Code | None
    qualifiers: Qualifiers | None
    start_time: Timestamp | Code | None
    end_time: Timestamp | Code | None
    schedule: str | None
    body: str
    lower: Number | None
    upper: Number | None


@dataclass
class GfsPeriod:
    time: Timestamp
    temperature: Number
    dewpoint: Number
    cloud: Code
    temperature_minmax: Number | None = None
    precip_chance_12: Number | None = None
    precip_amount_12: Code | None = None
    thunderstorm_12: Number | None = None
    severe_storm_12: Number | None = None
    freezing_precip: Number | None = None
    precip_type: Code | None = None
    snow: Number | None = None


@dataclass
class MavPeriod(GfsPeriod):
    wind_direction: Number | None = None
    wind_speed: Number | None = None
    precip_chance_6: Number | None = None
    precip_amount_6: Code | None = None
    thunderstorm_6: Number | None = None
    severe_storm_6: Number | None = None
    ceiling: Code | None = None
    visibility: Code | None = None
    vis_obstruction: Code | None = None


@dataclass
class MexPeriod(GfsPeriod):
    precip_chance_24: Number | None = None
    precip_amount_24: Code | None = None
    thunderstorm_24: Number | None = None
    severe_storm_24: Number | None = None
    rain_snow_mix: Number | None = None
    snow_amount_24: Code | None = None


@dataclass
class MavData(ReportData):
    forecast: list[MavPeriod]


@dataclass
class MexData(ReportData):
    forecast: list[MexPeriod]


@dataclass
class NbmUnits(Units):
    duration: str
    solar_radiation: str
    wave_height: str


@dataclass
class NbmPeriod:
    time: Timestamp
    temperature: Number | None = None
    dewpoint: Number | None = None
    sky_cover: Number | None = None
    wind_direction: Number | None = None
    wind_speed: Number | None = None
    wind_gust: Number | None = None
    snow_level: Number | None = None
    precip_duration: Number | None = None
    freezing_precip: Number | None = None
    snow: Number | None = None
    sleet: Number | None = None
    rain: Number | None = None
    solar_radiation: Number | None = None
    wave_height: Number | None = None


@dataclass
class NbhsShared(NbmPeriod):
    ceiling: Number | None = None
    visibility: Number | None = None
    cloud_base: Number | None = None
    mixing_height: Number | None = None
    transport_wind_direction: Number | None = None
    transport_wind_speed: Number | None = None
    haines: list[Number] | None = None


@dataclass
class NbhPeriod(NbhsShared):
    precip_chance_1: Number | None = None
    precip_chance_6: Number | None = None
    precip_amount_1: Number | None = None
    thunderstorm_1: Number | None = None
    snow_amount_1: Number | None = None
    icing_amount_1: Number | None = None


@dataclass
class NbsPeriod(NbhsShared):
    temperature_minmax: Number | None = None
    precip_chance_6: Number | None = None
    precip_chance_12: Number | None = None
    precip_amount_6: Number | None = None
    precip_amount_12: Number | None = None
    precip_duration: Number | None = None
    thunderstorm_3: Number | None = None
    thunderstorm_6: Number | None = None
    thunderstorm_12: Number | None = None
    snow_amount_6: Number | None = None
    icing_amount_6: Number | None = None


@dataclass
class NbePeriod(NbmPeriod):
    temperature_minmax: Number | None = None
    precip_chance_12: Number | None = None
    precip_amount_12: Number | None = None
    precip_amount_24: Number | None = None
    thunderstorm_12: Number | None = None
    snow_amount_12: Number | None = None
    snow_amount_24: Number | None = None
    icing_amount_12: Number | None = None


@dataclass
class NbxPeriod(NbmPeriod):
    precip_chance_12: Number | None = None
    precip_amount_12: Number | None = None
    precip_amount_24: Number | None = None
    snow_amount_12: Number | None = None
    icing_amount_12: Number | None = None


@dataclass
class NbhData(ReportData):
    forecast: list[NbhPeriod]


@dataclass
class NbsData(ReportData):
    forecast: list[NbsPeriod]


@dataclass
class NbeData(ReportData):
    forecast: list[NbePeriod]


@dataclass
class NbxData(ReportData):
    forecast: list[NbxPeriod]


# @dataclass
# class GfsPeriodTrans:
#     temperature: str
#     dewpoint: str
#     cloud: str
#     precip_chance_12: str
#     precip_amount_12: str
#     thunderstorm_12: str
#     severe_storm_12: str
#     freezing_precip: str
#     precip_type: str
#     snow: str


# @dataclass
# class MavPeriodTrans(GfsPeriodTrans):
#     wind_direction: str
#     wind_speed: str
#     precip_chance_6: str
#     precip_amount_6: str
#     thunderstorm_6: str
#     severe_storm_6: str
#     ceiling: str
#     visibility: str
#     vis_obstruction: str


# @dataclass
# class MexPeriodTrans(GfsPeriodTrans):
#     precip_chance_24: str
#     precip_amount_24: str
#     thunderstorm_24: str
#     severe_storm_24: str
#     rain_snow_mix: str
#     snow_amount_24: str


@dataclass
class Sanitization:
    """Tracks changes made during the sanitization process."""

    removed: list[str] = field(default_factory=list)
    replaced: dict[str, str] = field(default_factory=dict)
    duplicates_found: bool = False
    extra_spaces_found: bool = False
    extra_spaces_needed: bool = False

    @property
    def errors_found(self) -> bool:
        return bool(
            self.removed
            or self.replaced
            or self.duplicates_found
            or self.extra_spaces_found
            or self.extra_spaces_needed
        )

    def log(self, item: str, replacement: str | None = None) -> None:
        """Log a changed item. Calling without a replacement assumes removal."""
        item = item.strip()
        if not item:
            return
        if replacement is None:
            self.removed.insert(0, item)
            return
        replacement = replacement.strip()
        if not replacement:
            self.removed.insert(0, item)
        elif item != replacement:
            self.replaced[item] = replacement

    def log_list(self, before: list[str], after: list[str]) -> None:
        """Log list differences. Assumes that list length and order haven't changed."""
        for item, replacement in zip(before, after, strict=True):
            if item != replacement:
                self.log(item, replacement)


# ========================================
# 婧愭枃浠?: parsing/py
# ========================================
"""Contains the core parsing and indent functions of avwx."""

# stdlib


# library

# module

if TYPE_CHECKING:
    from collections.abc import Iterable


def dedupe(items: Iterable[Any], *, only_neighbors: bool = False) -> list[Any]:
    """Deduplicate a list while keeping order.

    If only_neighbors is True, dedupe will only check neighboring values.
    """
    ret: list[Any] = []
    for item in items:
        if (only_neighbors and ret and ret[-1] != item) or item not in ret:
            ret.append(item)
    return ret


def is_unknown(value: str) -> bool:
    """Return True if val represents and unknown value."""
    if not isinstance(value, str):
        raise TypeError
    if not value or value.upper() in {"UNKN", "UNK", "UKN"}:
        return True
    for char in value:
        if char not in ("/", "X", "."):
            break
    else:
        return True
    return False


def get_digit_list(data: list[str], from_index: int) -> tuple[list[str], list[str]]:
    """Return a list of items removed from a given list of strings
    that are all digits from 'from_index' until hitting a non-digit item.
    """
    ret = []
    data.pop(from_index)
    while len(data) > from_index and data[from_index].isdigit():
        ret.append(data.pop(from_index))
    return data, ret


def unpack_fraction(num: str) -> str:
    """Return unpacked fraction string 5/2 -> 2 1/2."""
    numbers = [int(n) for n in num.split("/") if n]
    if len(numbers) != 2 or numbers[0] <= numbers[1]:
        return num
    numerator, denominator = numbers
    over = numerator // denominator
    rem = numerator % denominator
    return f"{over} {rem}/{denominator}"


def remove_leading_zeros(num: str) -> str:
    """Strip zeros while handling -, M, and empty strings."""
    if not num:
        return num
    if num.startswith("M"):
        ret = "M" + num[1:].lstrip("0")
    elif num.startswith("-"):
        ret = "-" + num[1:].lstrip("0")
    else:
        ret = num.lstrip("0")
    return "0" if ret in ("", "M", "-") else ret


SPOKEN_POSTFIX = (
    (" zero zero zero", " thousand"),
    (" zero zero", " hundred"),
)


def spoken_number(num: str, *, literal: bool = False) -> str:
    """Return the spoken version of a number.

    If literal, no conversion to hundreds/thousands

    Ex: 1.2 -> one point two
        1 1/2 -> one and one half
        25000 -> two five thousand
    """
    ret = []
    for part in num.split():
        if part in FRACTIONS:
            ret.append(FRACTIONS[part])
        else:
            val = " ".join(NUMBER_REPL[char] for char in part if char in NUMBER_REPL)
            if not literal:
                for target, replacement in SPOKEN_POSTFIX:
                    if val.endswith(target):
                        val = val[: -len(target)] + replacement
            ret.append(val)
    return " and ".join(ret)


def make_fraction(
    num: str,
    repr: str | None = None,  # noqa: A002
    *,
    literal: bool = False,
    speak_prefix: str = "",
) -> Fraction:
    """Return a fraction dataclass for numbers with / in them."""
    num_str, den_str = num.split("/")
    # 2-1/2 but not -2 1/2
    if "-" in num_str and not num_str.startswith("-"):
        num_str = num_str.replace("-", " ")
    denominator = int(den_str)
    # Multiply multi-digit numerator
    if len(num_str) > 1:
        numerator = int(num_str[:-1]) * denominator + int(num_str[-1])
        num = f"{numerator}/{denominator}"
    else:
        numerator = int(num_str)
    value = numerator / denominator
    unpacked = unpack_fraction(num)
    spoken = speak_prefix + spoken_number(unpacked, literal=literal)
    return Fraction(repr or num, value, spoken, numerator, denominator, unpacked)


def make_number(
    num: str | None,
    repr: str | None = None,  # noqa: A002
    speak: str | None = None,
    *,
    literal: bool = False,
    special: dict | None = None,
    m_minus: bool = True,
) -> Number | Fraction | None:
    """Return a Number or Fraction dataclass for a number string.

    If literal, spoken string will not convert to hundreds/thousands.

    NOTE: Numerators are assumed to have a single digit. Additional are whole numbers.
    """
    if not num or is_unknown(num):
        return None
    # Check special
    with suppress(KeyError):
        item = (special or {}).get(num) or SPECIAL_NUMBERS[num]
        if isinstance(item, tuple):
            value, spoken = item
        else:
            value = item
            spoken = spoken_number(str(value), literal=literal)
        return Number(repr or num, value, spoken)
    # Check cardinal direction
    if num in CARDINALS:
        if not repr:
            repr = num  # noqa: A001
        num = str(CARDINALS[num])
    val_str = num
    # Remove unit suffixes
    if val_str.endswith("SM"):
        repr = val_str[:]  # noqa: A001
        val_str = val_str[:-2]
    # Remove spurious characters from the end
    num = num.rstrip("M.")
    num = num.replace("O", "0")
    num = num.replace("+", "")
    num = num.replace(",", "")
    # Handle Minus values with errors like 0M04
    if m_minus and "M" in num:
        val_str = num.replace("MM", "-").replace("M", "-")
        while val_str[0] != "-":
            val_str = val_str[1:]
    # Check value prefixes
    speak_prefix = ""
    if val_str.startswith("ABV "):
        speak_prefix += "above "
        val_str = val_str[4:]
    if val_str.startswith("BLW "):
        speak_prefix += "below "
        val_str = val_str[4:]
    if val_str.startswith("FL"):
        speak_prefix += "flight level "
        val_str, literal = val_str[2:], True
    if val_str.startswith("M"):
        speak_prefix += "less than "
        repr = repr or val_str  # noqa: A001
        val_str = val_str[1:]
    if val_str.startswith("P"):
        speak_prefix += "greater than "
        repr = repr or val_str  # noqa: A001
        val_str = val_str[1:]
    # Create Number
    if not val_str:
        return None
    ret: Number | Fraction | None = None
    # Create Fraction
    if "/" in val_str:
        ret = make_fraction(val_str, repr, literal=literal, speak_prefix=speak_prefix)
    else:
        val_str = val_str.replace(",", "")
        # Overwrite float 0 due to "0.0" literal
        value = float(val_str) or 0 if "." in num else int(val_str)
        spoken = speak_prefix + spoken_number(speak or str(value), literal=literal)
        ret = Number(repr or num, value, spoken)
    # Null the value if "greater than"/"less than"
    if ret and not m_minus and repr and repr.startswith(("M", "P")):
        ret.value = None
    return ret


def find_first_in_list(txt: str, str_list: list[str]) -> int:
    """Return the index of the earliest occurrence of an item from a list in a string.

    Ex: find_first_in_list('foobar', ['bar', 'fin']) -> 3
    """
    start = len(txt) + 1
    for item in str_list:
        if start > txt.find(item) > -1:
            start = txt.find(item)
    return start if len(txt) + 1 > start > -1 else -1


def is_timestamp(item: str) -> bool:
    """Return True if the item matches the timestamp format."""
    return len(item) == 7 and item[-1] == "Z" and item[:-1].isdigit()


def is_timerange(item: str) -> bool:
    """Return True if the item is a TAF to-from time range."""
    return len(item) == 9 and item[4] == "/" and item[:4].isdigit() and item[5:].isdigit()


def is_possible_temp(temp: str) -> bool:
    """Return True if all characters are digits or 'M' for minus."""
    return all((char.isdigit() or char == "M") for char in temp)


_Numeric = int | float


def relative_humidity(temperature: _Numeric, dewpoint: _Numeric, unit: str = "C") -> float:
    """Calculate the relative humidity as a 0 to 1 percentage."""

    def saturation(value: _Numeric) -> float:
        """Return the saturation vapor pressure without the C constant for humidity calc."""
        return math.exp((17.67 * value) / (243.5 + value))

    if unit == "F":
        dewpoint = (dewpoint - 32) * 5 / 9
        temperature = (temperature - 32) * 5 / 9
    return saturation(dewpoint) / saturation(temperature)


# https://aviation.stackexchange.com/questions/47971/how-do-i-calculate-density-altitude-by-hand


def pressure_altitude(pressure: float, altitude: _Numeric, unit: str = "inHg") -> int:
    """Calculate the pressure altitude in feet. Converts pressure units."""
    if unit == "hPa":
        pressure *= 0.02953
    return round((29.92 - pressure) * 1000 + altitude)


def density_altitude(pressure: float, temperature: _Numeric, altitude: _Numeric, units: Units) -> int:
    """Calculate the density altitude in feet. Converts pressure and temperature units."""
    if units.temperature == "F":
        temperature = (temperature - 32) * 5 / 9
    if units.altimeter == "hPa":
        pressure *= 0.02953
    pressure_alt = pressure_altitude(pressure, altitude)
    standard = 15 - (2 * altitude / 1000)
    return round(((temperature - standard) * 120) + pressure_alt)


def get_station_and_time(
    data: list[str],
) -> tuple[list[str], str | None, str | None]:
    """Return the report list and removed station ident and time strings."""
    if not data:
        return data, None, None
    station = data.pop(0)
    if not data:
        return data, station, None
    q_time, r_time = data[0], None
    if data and q_time.endswith("Z") and q_time[:-1].isdigit():
        r_time = data.pop(0)
    elif data and len(q_time) == 6 and q_time.isdigit():
        r_time = f"{data.pop(0)}Z"
    return data, station, r_time


def is_wind(text: str) -> bool:
    """Return True if the text is likely a normal wind element."""
    # Ignore wind shear
    if text.startswith("WS"):
        return False
    # 09010KT, 09010G15KT
    if len(text) > 4:
        for ending in WIND_UNITS:
            unit_index = text.find(ending)
            if text.endswith(ending) and text[unit_index - 2 : unit_index].isdigit():
                return True
    # 09010  09010G15 VRB10
    if len(text) != 5 and (len(text) < 8 or "G" not in text or "/" in text):
        return False
    return text[:5].isdigit() or (text.startswith("VRB") and text[3:5].isdigit())


VARIABLE_DIRECTION_PATTERN = re.compile(r"\d{3}V\d{3}")


def is_variable_wind_direction(text: str) -> bool:
    """Return True if element looks like 350V040."""
    if len(text) < 7:
        return False
    return VARIABLE_DIRECTION_PATTERN.match(text[:7]) is not None


def separate_wind(text: str) -> tuple[str, str, str]:
    """Extract the direction, speed, and gust from a wind element."""
    direction, speed, gust = "", "", ""
    # Remove gust
    if "G" in text:
        g_index = text.find("G")
        start, end = g_index + 1, g_index + 3
        # 16006GP99KT ie gust greater than
        if "GP" in text:
            end += 1
        gust = text[start:end]
        text = text[:g_index] + text[end:]
    if text:
        # 10G18KT
        if len(text) == 2:
            speed = text
        else:
            direction = text[:3]
            speed = text[3:]
    return direction, speed, gust


def get_wind(
    data: list[str], units: Units
) -> tuple[
    list[str],
    Number | None,
    Number | None,
    Number | None,
    list[Number],
]:
    """Return the report list, direction string, speed string, gust string, and variable direction list."""
    direction, speed, gust = "", "", ""
    variable: list[Number] = []
    # Remove unit and split elements
    if data:
        item = copy(data[0])
        if is_wind(item):
            for key, unit in WIND_UNITS.items():
                if item.endswith(key):
                    units.wind_speed = unit
                    item = item.replace(key, "")
                    break
            direction, speed, gust = separate_wind(item)
            data.pop(0)
    # Separated Gust
    if data and 1 < len(data[0]) < 4 and data[0][0] == "G" and data[0][1:].isdigit():
        gust = data.pop(0)[1:]
    # Variable Wind Direction
    if data and is_variable_wind_direction(data[0]):
        for item in data.pop(0).split("V"):
            value = make_number(item, speak=item, literal=True)
            if value is not None:
                variable.append(value)
    # Convert to Number
    direction_value = make_number(direction, speak=direction, literal=True)
    speed_value = make_number(speed.strip("BV"), m_minus=False)
    gust_value = make_number(gust, m_minus=False)
    return data, direction_value, speed_value, gust_value, variable


def get_visibility(data: list[str], units: Units) -> tuple[list[str], Number | None]:
    """Return the report list and removed visibility string."""
    visibility = ""
    if data:
        item = copy(data[0])
        # Vis reported in statue miles
        if item.endswith("SM"):  # 10SM
            if item[:-2].isdigit():
                visibility = str(int(item[:-2]))
            elif "/" in item:
                visibility = item[: item.find("SM")]  # 1/2SM
            else:
                visibility = item[:-2]
            data.pop(0)
            units.visibility = "sm"
        # Vis reported in meters
        elif len(item) == 4 and item.isdigit():
            visibility = data.pop(0)
            units.visibility = "m"
        elif 7 >= len(item) >= 5 and item[:4].isdigit() and (item[4] in ["M", "N", "S", "E", "W"] or item[4:] == "NDV"):
            visibility = data.pop(0)[:4]
            units.visibility = "m"
        elif len(item) == 5 and item[1:].isdigit() and item[0] in ["M", "P", "B"]:
            visibility = data.pop(0)[1:]
            units.visibility = "m"
        elif item.endswith("KM"):
            visibility = f"{item[:-2]}000"
            data.pop(0)
            units.visibility = "m"
        # Vis statute miles but split Ex: 2 1/2SM
        elif len(data) > 1 and data[1].endswith("SM") and "/" in data[1] and item.isdigit():
            vis1 = data.pop(0)  # 2
            vis2 = data.pop(0).replace("SM", "")  # 1/2
            visibility = str(int(vis1) * int(vis2[2]) + int(vis2[0])) + vis2[1:]  # 5/2
            units.visibility = "sm"
    return data, make_number(visibility, m_minus=False)


def sanitize_cloud(cloud: str) -> str:
    """Fix rare cloud layer issues."""
    if len(cloud) < 4:
        return cloud
    if not cloud[3].isdigit() and cloud[3] not in ("/", "-"):
        # Bad "O": FEWO03 -> FEW003
        if cloud[3] == "O":
            cloud = f"{cloud[:3]}0{cloud[4:]}"
        # Move modifiers to end: BKNC015 -> BKN015C
        elif cloud[3] != "U" and cloud[:4] not in {"BASE", "UNKN"}:
            cloud = cloud[:3] + cloud[4:] + cloud[3]
    return cloud


def _null_or_int(val: str | None) -> int | None:
    """Nullify unknown elements and convert ints."""
    return None if not isinstance(val, str) or is_unknown(val) else int(val)


_TOP_OFFSETS = ("-TOPS", "-TOP")


def make_cloud(cloud: str) -> Cloud:
    """Return a Cloud dataclass for a cloud string.

    This function assumes the input is potentially valid.
    """
    raw_cloud = cloud
    cloud_type = ""
    base: str | None = None
    top: str | None = None
    cloud = sanitize_cloud(cloud).replace("/", "")
    # Separate top
    for target in _TOP_OFFSETS:
        topi = cloud.find(target)
        if topi > -1:
            top, cloud = cloud[topi + len(target) :], cloud[:topi]
            break
    # Separate type
    ## BASE027
    if cloud.startswith("BASES"):
        cloud = cloud[5:]
    elif cloud.startswith("BASE"):
        cloud = cloud[4:]
    ## VV003
    elif cloud.startswith("VV"):
        cloud_type, cloud = cloud[:2], cloud[2:]
    ## FEW010
    elif len(cloud) >= 3 and cloud[:3] in CLOUD_LIST:
        cloud_type, cloud = cloud[:3], cloud[3:]
    ## BKN-OVC065
    if len(cloud) > 4 and cloud[0] == "-" and cloud[1:4] in CLOUD_LIST:
        cloud_type += cloud[:4]
        cloud = cloud[4:]
    # Separate base
    if len(cloud) >= 3 and cloud[:3].isdigit():
        base, cloud = cloud[:3], cloud[3:]
    elif len(cloud) >= 4 and cloud[:4] == "UNKN":
        cloud = cloud[4:]
    # Remainder is considered modifiers
    modifier = cloud or None
    # Make Cloud
    return Cloud(raw_cloud, cloud_type or None, _null_or_int(base), _null_or_int(top), modifier)


def get_clouds(data: list[str]) -> tuple[list[str], list]:
    """Return the report list and removed list of split cloud layers."""
    clouds = []
    for i, item in reversed(list(enumerate(data))):
        if item[:3] in CLOUD_LIST or item[:2] == "VV":
            cloud = data.pop(i)
            clouds.append(make_cloud(cloud))
    # Attempt cloud sort. Fails if None values are present
    try:
        clouds.sort(key=lambda cloud: (cloud.base, cloud.type))
    except TypeError:
        clouds.reverse()  # Restores original report order
    return data, clouds


def get_flight_rules(visibility: Number | None, ceiling: Cloud | None) -> int:
    """Return int based on current flight rules from parsed METAR data.

    0=VFR, 1=MVFR, 2=IFR, 3=LIFR

    Note: Common practice is to report no higher than IFR if visibility unavailable.
    """
    # Parse visibility
    vis: _Numeric
    if visibility is None:
        vis = 2
    elif visibility.repr == "CAVOK" or visibility.repr.startswith("P6"):
        vis = 10
    elif visibility.repr.startswith("M"):
        vis = 0
    elif visibility.value is None:
        vis = 2
    # Convert meters to miles
    elif len(visibility.repr) == 4:
        vis = (visibility.value or 0) * 0.000621371
    else:
        vis = visibility.value or 0
    # Parse ceiling
    cld = (ceiling.base if ceiling else 99) or 99
    # Determine flight rules
    if (vis <= 5) or (cld <= 30):
        if (vis < 3) or (cld < 10):
            if (vis < 1) or (cld < 5):
                return 3  # LIFR
            return 2  # IFR
        return 1  # MVFR
    return 0  # VFR


def get_ceiling(clouds: list[Cloud]) -> Cloud | None:
    """Return ceiling layer from Cloud-List or None if none found.

    Assumes that the clouds are already sorted lowest to highest.

    Only 'Broken', 'Overcast', and 'Vertical Visibility' are considered ceilings.

    Prevents errors due to lack of cloud information (eg. '' or 'FEW///')
    """
    return next((c for c in clouds if c.base and c.type in {"OVC", "BKN", "VV"}), None)


def is_altitude(value: str) -> bool:
    """Return True if the value is a possible altitude."""
    if len(value) < 5:
        return False
    if value.startswith("SFC/"):
        return True
    if value.startswith("FL") and value[2:5].isdigit():
        return True
    first, *_ = value.split("/")
    return bool(first[-2:] == "FT" and first[-5:-2].isdigit())


def make_altitude(
    value: str,
    units: Units,
    repr: str | None = None,  # noqa: A002
    *,
    force_fl: bool = False,
) -> tuple[Number | None, Units]:
    """Convert altitude string into a number."""
    if not value:
        return None, units
    raw = repr or value
    for end in ("FT", "M"):
        if value.endswith(end):
            force_fl = False
            units.altitude = end.lower()
            value = value.removesuffix(end)
    # F430
    if value[0] == "F" and value[1:].isdigit():
        value = f"FL{value[1:]}"
    if force_fl and value[:2] != "FL":
        value = f"FL{value}"
    return make_number(value, repr=raw), units


def parse_date(
    date: str,
    hour_threshold: int = 200,
    *,
    time_only: bool = False,
    target: dt.date | None = None,
) -> dt.datetime | None:
    """Parse a report timestamp in ddhhZ or ddhhmmZ format.

    If time_only, assumes hhmm format with current or previous day.

    This function assumes the given timestamp is within the hour threshold from current date.
    """
    # Format date string
    date = date.strip("Z")
    if not date.isdigit():
        return None
    if time_only:
        if len(date) != 4:
            return None
        index_hour = 0
    else:
        if len(date) == 4:
            date += "00"
        if len(date) != 6:
            return None
        index_hour = 2
    # Create initial guess
    if target:
        target = dt.datetime(target.year, target.month, target.day, tzinfo=dt.timezone.utc)
    else:
        target = dt.datetime.now(tz=dt.timezone.utc)
    day = target.day if time_only else int(date[:2])
    hour = int(date[index_hour : index_hour + 2])
    # Handle situation where next month has less days than current month
    # Shifted value makes sure that a month shift doesn't happen twice
    shifted = False
    if day > monthrange(target.year, target.month)[1]:
        target += relativedelta(months=-1)
        shifted = True
    try:
        guess = target.replace(
            day=day,
            hour=hour % 24,
            minute=int(date[index_hour + 2 : index_hour + 4]) % 60,
            second=0,
            microsecond=0,
        )
    except ValueError:
        return None
    # Handle overflow hour
    if hour > 23:
        guess += dt.timedelta(days=1)
    # Handle changing months if not already shifted
    if not shifted:
        hourdiff = (guess - target) / dt.timedelta(minutes=1) / 60
        if hourdiff > hour_threshold:
            guess += relativedelta(months=-1)
        elif hourdiff < -hour_threshold:
            guess += relativedelta(months=+1)
    return guess


def make_timestamp(
    timestamp: str | None,
    *,
    time_only: bool = False,
    target_date: dt.date | None = None,
) -> Timestamp | None:
    """Return a Timestamp dataclass for a report timestamp in ddhhZ or ddhhmmZ format."""
    if not timestamp:
        return None
    date_obj = parse_date(timestamp, time_only=time_only, target=target_date)
    return Timestamp(timestamp, date_obj)


def is_runway_visibility(item: str) -> bool:
    """Return True if the item is a runway visibility range string."""
    return (
        len(item) > 4
        and item[0] == "R"
        and (item[3] == "/" or item[4] == "/")
        and item[1:3].isdigit()
        and "CLRD" not in item  # R28/CLRD70 Runway State
    )


# ========================================
# 婧愭枃浠?: parsing/py
# ========================================
"""Contains functions for handling and translating """

# stdlib


# module

Codes = list[str]


def decimal_code(code: str, repr: str | None = None) -> Number | None:  # noqa: A002
    """Parse a 4-digit decimal temperature representation.

    Ex: 1045 -> -4.5    0237 -> 23.7
    """
    if not code:
        return None
    number = f"{'-' if code[0] == '1' else ''}{int(code[1:3])}.{code[3]}"
    return make_number(number, repr or code)


def temp_dew_decimal(codes: Codes) -> tuple[Codes, Number | None, Number | None]:
    """Return the decimal temperature and dewpoint values."""
    temp, dew = None, None
    for i, code in reversed(list(enumerate(codes))):
        if len(code) in {5, 9} and code[0] == "T" and code[1:].isdigit():
            codes.pop(i)
            temp, dew = decimal_code(code[1:5]), decimal_code(code[5:])
            break
    return codes, temp, dew


def temp_minmax(codes: Codes) -> tuple[Codes, Number | None, Number | None]:
    """Return the 24-hour minimum and maximum temperatures."""
    maximum, minimum = None, None
    for i, code in enumerate(codes):
        if len(code) == 9 and code[0] == "4" and code.isdigit():
            maximum, minimum = decimal_code(code[1:5]), decimal_code(code[5:])
            codes.pop(i)
            break
    return codes, maximum, minimum


def precip_snow(codes: Codes) -> tuple[Codes, Number | None, Number | None]:
    """Return the hourly precipitation and snow depth."""
    precip, snow = None, None
    for i, code in reversed(list(enumerate(codes))):
        if len(code) != 5:
            continue
        # P0213
        if code[0] == "P" and code[1:].isdigit():
            precip = make_number(f"{code[1:3]}.{code[3:]}", code)
            codes.pop(i)
        # 4/012
        elif code[:2] == "4/" and code[2:].isdigit():
            snow = make_number(code[2:], code)
            codes.pop(i)
    return codes, precip, snow


def sea_level_pressure(codes: Codes) -> tuple[Codes, Number | None]:
    """Return the sea level pressure always in hPa."""
    sea = None
    for i, code in enumerate(codes):
        if len(code) == 6 and code.startswith("SLP") and code[-3:].isdigit():
            value = f"{'9' if int(code[-3]) > 4 else '10'}{code[-3:-1]}.{code[-1]}"
            sea = make_number(value, code)
            codes.pop(i)
            break
    return codes, sea


def parse_pressure(code: str) -> PressureTendency:
    """Parse a 5-digit pressure tendency."""
    return PressureTendency(
        repr=code,
        tendency=PRESSURE_TENDENCIES[code[1]],
        change=float(f"{code[2:4]}.{code[4]}"),
    )


def parse_precipitation(code: str) -> Number | None:
    """Parse a 5-digit precipitation amount."""
    return make_number(f"{code[1:3]}.{code[3:]}", code)


def five_digit_codes(codes: Codes) -> tuple[Codes, FiveDigitCodes]:
    """Return  a 5-digit min/max temperature code."""
    values = FiveDigitCodes()
    for i, code in reversed(list(enumerate(codes))):
        if len(code) == 5 and code.isdigit():
            key = int(code[0])
            if key == 1:
                values.maximum_temperature_6 = decimal_code(code[1:], code)
            elif key == 2:
                values.minimum_temperature_6 = decimal_code(code[1:], code)
            elif key == 5:
                values.pressure_tendency = parse_pressure(code)
            elif key == 6:
                values.precip_36_hours = parse_precipitation(code)
            elif key == 7:
                values.precip_24_hours = parse_precipitation(code)
            elif key == 9:
                values.sunshine_minutes = make_number(code[2:], code)
            else:
                continue
            codes.pop(i)
    return codes, values


def find_codes(rmk: str) -> tuple[Codes, list[Code]]:
    """Find a remove known static codes from the starting remarks list."""
    ret = []
    for key, value in REMARKS_GROUPS.items():
        if key in rmk:
            ret.append(Code(key, value))
            rmk.replace(key, "")
    codes = [i for i in rmk.split() if i]
    for i, code in reversed(list(enumerate(codes))):
        with suppress(KeyError):
            ret.append(Code(code, REMARKS_ELEMENTS[code]))
            codes.pop(i)
        # Weather began/ended
        if len(code) == 5 and code[2] in ("B", "E") and code[3:].isdigit() and code[:2] in WX_TRANSLATIONS:
            state = "began" if code[2] == "B" else "ended"
            value = f"{WX_TRANSLATIONS[code[:2]]} {state} at :{code[3:]}"
            ret.append(Code(code, value))
            codes.pop(i)
    ret.sort(key=lambda x: x.repr)
    return codes, ret


def parse(rmk: str) -> RemarksData | None:
    """Find temperature and dewpoint decimal values from the """
    if not rmk:
        return None
    codes, parsed_codes = find_codes(rmk)
    codes, temperature, dewpoint = temp_dew_decimal(codes)
    codes, max_temp, min_temp = temp_minmax(codes)
    codes, precip, snow = precip_snow(codes)
    codes, sea = sea_level_pressure(codes)
    codes, fivedigits = five_digit_codes(codes)
    return RemarksData(
        codes=parsed_codes,
        dewpoint_decimal=dewpoint,
        temperature_decimal=temperature,
        minimum_temperature_6=fivedigits.minimum_temperature_6,
        minimum_temperature_24=min_temp,
        maximum_temperature_6=fivedigits.maximum_temperature_6,
        maximum_temperature_24=max_temp,
        pressure_tendency=fivedigits.pressure_tendency,
        precip_36_hours=fivedigits.precip_36_hours,
        precip_24_hours=fivedigits.precip_24_hours,
        sunshine_minutes=fivedigits.sunshine_minutes,
        precip_hourly=precip,
        snow_depth=snow,
        sea_level_pressure=sea,
    )


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/base.py
# ========================================
"""Cleaning base classes."""



class Cleaner:
    """Base Cleaner type."""

    # Set to True if no more cleaners should check this item
    should_break: bool = False


class SingleItem(Cleaner):
    """Cleaner looks at a single item."""

    def can_handle(self, item: str) -> bool:
        """Return True if the element can and needs to be cleaned."""
        raise NotImplementedError


class DoubleItem(Cleaner):
    """Cleaner that looks at two neighboring items."""

    def can_handle(self, first: str, second: str) -> bool:
        """Return True if neighboring pairs need to be cleaned."""
        raise NotImplementedError


class RemoveItem(SingleItem):
    """Sanitization should remove item if handled."""

    should_break = True


class CleanItem(SingleItem):
    """Sanitization should clean/replace item if handled."""

    def clean(self, item: str) -> str:
        """Clean the raw string."""
        raise NotImplementedError


class CleanPair(DoubleItem):
    """Sanitization should clean both paired items."""

    def clean(self, first: str, second: str) -> tuple[str, str]:
        """Clean both raw strings."""
        raise NotImplementedError


class SplitItem(Cleaner):
    """Sanitization should split the item in two at an index if handled"""

    def split_at(self, item: str) -> int | None:
        """Return the string index where the item should be split."""
        raise NotImplementedError


class CombineItems(Cleaner):
    """Sanitization should combine two different items if handled."""

    def can_handle(self, first: str, second: str) -> bool:
        """Return True if both elements can and need to be combined."""
        raise NotImplementedError


CleanerListType = list[type[CleanItem] | type[CleanPair] | type[RemoveItem] | type[SplitItem] | type[CombineItems]]


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/cleaners.py
# ========================================
"""Cleaners for elements not found in other files."""




class OnlySlashes(RemoveItem):
    """Remove elements containing only '/'."""

    def can_handle(self, item: str) -> bool:
        return is_unknown(item)


class TrimWxCode(CleanItem):
    """Remove RE from wx codes: REVCTS -> VCTS."""

    def can_handle(self, item: str) -> bool:
        if not item.startswith("RE") or item == "RE":
            return False
        return all(sub in WX_TRANSLATIONS for sub in wrap(item[2:], 2))

    def clean(self, item: str) -> str:
        return item[2:]


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/cloud.py
# ========================================
"""Cleaners for cloud elements."""



def separate_cloud_layers(text: str) -> str:
    """Check for missing spaces in front of cloud layers.
    Ex: TSFEW004SCT012FEW///CBBKN080
    """
    for cloud in CLOUD_LIST:
        if cloud in text and f" {cloud}" not in text:
            start, counter = 0, 0
            while text.count(cloud) != text.count(f" {cloud}"):
                cloud_index = start + text[start:].find(cloud)
                if len(text[cloud_index:]) >= 3:
                    target = text[cloud_index + len(cloud) : cloud_index + len(cloud) + 3]
                    if target.isdigit() or not target.strip("/"):
                        text = f"{text[:cloud_index]} {text[cloud_index:]}"
                start = cloud_index + len(cloud) + 1
                # Prevent infinite loops
                if counter > text.count(cloud):
                    break
                counter += 1
    return text


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/joined.py
# ========================================
"""Cleaners where two items are joined."""




_CLOUD_GROUP = "(" + "|".join(CLOUD_LIST) + ")"
CLOUD_SPACE_PATTERNS = [
    re.compile(pattern)
    for pattern in (
        f"(?=.+){_CLOUD_GROUP}" + r"\d{3}(\w{2,3})?$",  # SCT010BKN021
        r"M?\d{2}\/M?\d{2}$",  # BKN01826/25
    )
]


class JoinedCloud(SplitItem):
    """For items starting with cloud list."""

    def split_at(self, item: str) -> int | None:
        if item[:3] in CLOUD_LIST:
            for pattern in CLOUD_SPACE_PATTERNS:
                match = pattern.search(item)
                if match is None:
                    continue
                if match.start():
                    return match.start()
        return None


_TIMESTAMP_BREAKS = ((7, is_timestamp), (9, is_timerange))


class JoinedTimestamp(SplitItem):
    """Connected timestamp."""

    def split_at(self, item: str) -> int | None:
        return next(
            (loc for loc, check in _TIMESTAMP_BREAKS if len(item) > loc and check(item[:loc])),
            None,
        )


class JoinedWind(SplitItem):
    """Connected to wind."""

    def split_at(self, item: str) -> int | None:
        if len(item) > 5 and "KT" in item and not item.endswith("KT"):
            index = item.find("KT")
            if index > 4:
                return index + 2
        return None


class JoinedTafNewLine(SplitItem):
    """TAF newline connected to previous element."""

    def split_at(self, item: str) -> int | None:
        for key in TAF_NEWLINE:
            if key in item and not item.startswith(key):
                return item.find(key)
        for key in TAF_NEWLINE_STARTSWITH:
            if key in item and not item.startswith(key):
                index = item.find(key)
                if item[index + len(key) :].isdigit():
                    return index
        return None


class JoinedMinMaxTemperature(SplitItem):
    """Connected TAF min/max temp."""

    def split_at(self, item: str) -> int | None:
        if "TX" in item and "TN" in item and item.endswith("Z") and "/" in item:
            tx_index, tn_index = item.find("TX"), item.find("TN")
            return max(tx_index, tn_index)
        return None


RVR_PATTERN = re.compile(r"R\d{2}[RCL]?/\S+")


class JoinedRunwayVisibility(SplitItem):
    """Connected RVR elements.
    Ex: R36/1500DR18/P2000
    """

    def split_at(self, item: str) -> int | None:
        return match.start() + 1 if (match := RVR_PATTERN.search(item[1:])) else None


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/remove.py
# ========================================
"""Cleaners for elements that should be removed."""


_SHARED = {
    "$",
    "KT",  # Place after extra-space-exists cleaners
    "M",
    ".",
    "1/SM",
}

_CURRENT = {
    "AUTO",
    "NSC",
    "NCD",
    "RTD",
    "SPECI",
    "CORR",
}

_METAR = {
    *_SHARED,
    *_CURRENT,
    "METAR",
    "CLR",
    "SKC",
    "COR",
}

_TAF = {
    *_SHARED,
    *_CURRENT,
    "TAF",
    "TTF",
}


def remove_items_in(filter_out: set[str]) -> type[RemoveItem]:
    """Generate a RemoveItem cleaner to filter a given set of strings."""

    class RemoveInList(RemoveItem):
        """Cleaner to remove items in a list"""

        def can_handle(self, item: str) -> bool:
            return item in filter_out

    return RemoveInList


RemoveFromMetar = remove_items_in(_METAR)
RemoveFromTaf = remove_items_in(_TAF)


class RemoveTafAmend(RemoveItem):
    """Remove amend signifier from start of report ('CCA', 'CCB', etc)."""

    def can_handle(self, item: str) -> bool:
        return len(item) == 3 and item.startswith("CC") and item[2].isalpha()


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/replace.py
# ========================================
"""Cleaners for elements that should be replaced."""


# These replacement dicts are applied when the report is still a string

_SHARED = {
    "!": "1",
    "@": "2",
    "#": "3",
    "%": "5",
    "^": "6",
    "&": "7",
    "*": "8",
    "?": " ",
    '"': "",
    "'": "",
    "`": "",
    ".": "",
    "(": " ",
    ")": " ",
    ";": " ",
}

_WIND = {
    "MISSINGKT": "",
    " 0I0": " 090",
    "NOSIGKT ": "KT NOSIG ",
    "KNOSIGT ": "KT NOSIG ",
    "/VRB": " VRB",
    "CALMKT ": "CALM ",
    "CLMKT ": "CALM ",
    "CLRKT ": "CALM ",
}

_VISIBILITY = {
    " <1/": " M1/",  # <1/4SM <1/8SM
    "/04SM": "/4SM",
    "/4SSM": "/4SM",
    "/08SM": "/8SM",
    " /34SM": "3/4SM",
    " 3/SM": " 3/4SM",
    "PQ6SM ": "P6SM ",
    "P6000F ": "P6000FT ",
    "P6000FTQ ": "P6000FT ",
}

_CLOUD = {
    " C A V O K ": " CAVOK ",
    "N0SIG": "NOSIG",
    "SCATTERED": "SCT",
    "BROKEN": "BKN",
    "OVERCAST": "OVC",
}

CURRENT = _SHARED | _WIND | _VISIBILITY | _CLOUD


# These are item replacements after the report has been split

ITEM_REPL = {"CALM": "00000KT", "A01": "AO1", "A02": "AO2", "PROB3O": "PROB30"}


class ReplaceItem(CleanItem):
    """Replace report elements after splitting."""

    def can_handle(self, item: str) -> bool:
        return item in ITEM_REPL

    def clean(self, item: str) -> str:
        return ITEM_REPL[item]


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/separated.py
# ========================================
"""Cleaners where an element is separated."""



class SeparatedDistance(CombineItems):
    """Distance digit and/or unit.
    Ex: 10 SM
    """

    def can_handle(self, first: str, second: str) -> bool:
        return first.isdigit() and second in {"SM", "0SM"}


class SeparatedFirstTemperature(CombineItems):
    """Temperature before slash.
    Ex: 12 /10
    """

    def can_handle(self, first: str, second: str) -> bool:
        return first.isdigit() and len(second) > 2 and second[0] == "/" and second[1:].isdigit()


class SeparatedCloudAltitude(CombineItems):
    """Known cloud types.
    Ex: OVC 040
    """

    def can_handle(self, first: str, second: str) -> bool:
        return second.isdigit() and first in CLOUD_LIST


class SeparatedSecondTemperature(CombineItems):
    """Temperature after slash.
    Ex: 12/ 10
    """

    def can_handle(self, first: str, second: str) -> bool:
        return second.isdigit() and len(first) > 2 and first.endswith("/") and first[:-1].isdigit()


class SeparatedAltimeterLetter(CombineItems):
    """Altimeter letter prefix.
    Ex: Q 1001
    """

    def can_handle(self, first: str, second: str) -> bool:
        if not second.isdigit():
            return False
        if first == "Q":
            return second[0] in {"0", "1"}
        return second[0] in {"2", "3"} if first == "A" else False


class SeparatedTemperatureTrailingDigit(CombineItems):
    """Dewpoint split.
    Ex: 12/1 0
    """

    def can_handle(self, first: str, second: str) -> bool:
        return (
            len(second) == 1
            and second.isdigit()
            and len(first) > 3
            and first[:2].isdigit()
            and "/" in first
            and first[3:].isdigit()
        )


class SeparatedWindUnit(CombineItems):
    """Wind unit disconnected or split in two."""

    def can_handle(self, first: str, second: str) -> bool:
        # 36010G20 KT
        if (
            second in WIND_UNITS
            and first[-1].isdigit()
            and (first[:5].isdigit() or (first.startswith("VRB") and first[3:5].isdigit()))
        ):
            return True
        # 36010K T
        return (
            second == "T"
            and len(first) >= 6
            and (first[:5].isdigit() or (first.startswith("VRB") and first[3:5].isdigit()))
            and first[-1] == "K"
        )


class SeparatedCloudQualifier(CombineItems):
    """Cloud descriptors.
    Ex: OVC022 CB
    """

    def can_handle(self, first: str, second: str) -> bool:
        return second in CLOUD_TRANSLATIONS and second not in CLOUD_LIST and len(first) >= 3 and first[:3] in CLOUD_LIST


class SeparatedTafTimePrefix(CombineItems):
    """TAF new time period.
    Ex: FM 122400
    """

    def can_handle(self, first: str, second: str) -> bool:
        return first in {"FM", "TL"} and (second.isdigit() or (second.endswith("Z") and second[:-1].isdigit()))


class SeparatedMinMaxTemperaturePrefix(CombineItems):
    """TAF min max temperature prefix.
    Ex: TX 20/10
    """

    def can_handle(self, first: str, second: str) -> bool:
        return first in {"TX", "TN"} and "/" in second


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/temperature.py
# ========================================
"""Cleaners for temperature elements."""


# T15/0913Z T32/0923Z


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/visibility.py
# ========================================
"""Cleaners for visibility elements."""



VIS_PERMUTATIONS = ["".join(p) for p in permutations("P6SM")]
VIS_PERMUTATIONS.remove("6MPS")
VIS_PERMUTATIONS += ["6+SM"]


class VisibilityGreaterThan(CleanItem):
    """Fix inconsistent 'P6SM'.
    Ex: TP6SM or 6PSM -> P6SM
    """

    def can_handle(self, item: str) -> bool:
        return len(item) > 3 and item[-4:] in VIS_PERMUTATIONS

    def clean(self, _: str) -> str:
        return "P6SM"


class RunwayVisibilityUnit(CleanItem):
    """Fix RVR where FT unit is cut short."""

    def can_handle(self, item: str) -> bool:
        return is_runway_visibility(item) and item.endswith("F")

    def clean(self, item: str) -> str:
        return f"{item}T"


# ========================================
# 婧愭枃浠?: parsing/sanitization/cleaners/wind.py
# ========================================
"""Cleaners for wind elements."""



WIND_REMV = ("/", "-", "{", "}", "(N)", "(E)", "(S)", "(W)")

WIND_REPL = {
    "O": "0",
    "|": "1",
    "MPSM": "MPS",  # conflict with SM
    "FG": "G",
    "GG": "G",
    "GT": "G",
    "GS": "G",
    "SQ": "G",
    "CT": "KT",
    "JT": "KT",
    "SM": "KT",
    "KTKT": "KT",  # Must come before TK
    "TK": "KT",
    "LKT": "KT",
    "ZKT": "KT",
    "KKT": "KT",
    "JKT": "KT",
    "KLT": "KT",
    "TKT": "KT",
    "GKT": "KT",
    "PKT": "KT",
    "XKT": "KT",
    "VRBL": "VRB",  # Not caught in WIND_VRB
}

WIND_VRB = ("WBB",)

KT_PATTERN = re.compile(r"\b[\w\d]*\d{2}K[^T]\b")


def sanitize_wind(text: str) -> str:
    """Fix rare wind issues that may be too broad otherwise."""
    for rep in WIND_REMV:
        text = text.replace(rep, "")
    for key, rep in WIND_REPL.items():
        text = text.replace(key, rep)
    if len(text) > 4 and not text.startswith("VRB") and not text[:3].isdigit():
        # Catches majority of cases where at least two valid letters are found
        if len(set(text[:4]).intersection({"V", "R", "B"})) > 1:
            for i, char in enumerate(text):
                if char.isdigit():
                    text = f"VRB{text[i:]}"
                    break
        else:
            for key in WIND_VRB:
                if text.startswith(key):
                    zero = "0" if key[-1] == "0" else ""
                    text = text.replace(key, f"VRB{zero}")
                    break
    # Final check for end units. Remainder of string would be fixed at this point if valid
    # For now, it's only checking for K(T) since that is most instances
    # The parser can still handle/expect missing and spearated units
    if KT_PATTERN.match(text):
        text = f"{text[:-1]}T"
    if text.endswith("K"):
        text += "T"
    return text


class EmptyWind(RemoveItem):
    """Remove empty wind /////KT."""

    def can_handle(self, item: str) -> bool:
        return item.endswith("KT") and is_unknown(item[:-2])


# TODO: Generalize to find anywhere in wind. Maybe add to other wind sans?
class MisplaceWindKT(CleanItem):
    """Fix misplaced KT 22022KTG40."""

    def can_handle(self, item: str) -> bool:
        return len(item) == 10 and "KTG" in item and item[:5].isdigit()

    def clean(self, item: str) -> str:
        return item.replace("KTG", "G") + "KT"


class DoubleGust(CleanItem):
    """Fix gust double G.
    Ex: 360G17G32KT
    """

    def can_handle(self, item: str) -> bool:
        return len(item) > 10 and item.endswith("KT") and item[3] == "G"

    def clean(self, item: str) -> str:
        return item[:3] + item[4:]


class WindLeadingMistype(CleanItem):
    """Fix leading character mistypes in wind."""

    def can_handle(self, item: str) -> bool:
        return (
            len(item) > 7
            and not item[0].isdigit()
            and not item.startswith("VRB")
            and item.endswith("KT")
            and not item.startswith("WS")
        )

    def clean(self, item: str) -> str:
        while item and not item[0].isdigit() and not item.startswith("VRB"):
            item = item[1:]
        return item


class NonGGust(CleanItem):
    """Fix non-G gust.
    Ex: 14010-15KT
    """

    def can_handle(self, item: str) -> bool:
        return len(item) == 10 and item.endswith("KT") and item[5] != "G"

    def clean(self, item: str) -> str:
        return f"{item[:5]}G{item[6:]}"


class RemoveVrbLeadingDigits(CleanItem):
    """Fix leading digits on VRB wind.
    Ex: 2VRB02KT
    """

    def can_handle(self, item: str) -> bool:
        return len(item) > 7 and item.endswith("KT") and "VRB" in item and item[0].isdigit() and "Z" not in item

    def clean(self, item: str) -> str:
        while item[0].isdigit():
            item = item[1:]
        return item


# ========================================
# 婧愭枃浠?: parsing/sanitization/base.py
# ========================================
"""Core sanitiation functions that accept report-specific elements."""




def sanitize_string_with(
    replacements: dict[str, str],
) -> Callable[[str, Sanitization], str]:
    """Return a function to sanitize the report string with a given list of replacements."""

    def sanitize_report_string(text: str, sans: Sanitization) -> str:
        """Provide sanitization for operations that work better when the report is a string."""
        text = text.strip().upper().rstrip("=")
        if len(text) < 4:
            return text
        # Standardize whitespace
        text = " ".join(text.split())
        # Prevent changes to station ID
        stid, text = text[:4], text[4:]
        # Replace invalid key-value pairs
        for key, rep in replacements.items():
            if key in text:
                text = text.replace(key, rep)
                sans.log(key, rep)
        separated = separate_cloud_layers(text)
        if text != separated:
            sans.extra_spaces_needed = True
        return stid + separated

    return sanitize_report_string


def sanitize_list_with(
    cleaners: CleanerListType,
) -> Callable[[list[str], Sanitization], list[str]]:
    """Return a function to sanitize the report list with a given list of cleaners."""
    _cleaners = [o() for o in cleaners]

    def sanitize_report_list(wxdata: list[str], sans: Sanitization) -> list[str]:
        """Provide sanitization for operations that work better when the report is a list."""
        for i, item in reversed(list(enumerate(wxdata))):
            for cleaner in _cleaners:
                # TODO: Py3.10 change to match/case on type
                if isinstance(cleaner, CombineItems):
                    if i and cleaner.can_handle(wxdata[i - 1], item):
                        wxdata[i - 1] += wxdata.pop(i)
                        sans.extra_spaces_found = True
                        if cleaner.should_break:
                            break
                elif isinstance(cleaner, SplitItem):
                    if index := cleaner.split_at(item):
                        wxdata.insert(i + 1, item[index:])
                        wxdata[i] = item[:index]
                        sans.extra_spaces_needed = True
                        if cleaner.should_break:
                            break
                elif isinstance(cleaner, CleanPair):
                    if i and cleaner.can_handle(wxdata[i - 1], item):
                        clean_first, clean_second = cleaner.clean(wxdata[i - 1], item)
                        if wxdata[i - 1] != clean_first:
                            sans.log(wxdata[i - 1], clean_first)
                            wxdata[i - 1] = clean_first
                        if item != clean_second:
                            sans.log(item, clean_second)
                            wxdata[i] = clean_second
                            break
                elif cleaner.can_handle(item):
                    if isinstance(cleaner, RemoveItem):
                        sans.log(wxdata.pop(i))
                    elif isinstance(cleaner, CleanItem):
                        cleaned = cleaner.clean(item)
                        wxdata[i] = cleaned
                        sans.log(item, cleaned)
                    if cleaner.should_break:
                        break

        # TODO: Replace with above syntax after testing?
        # May wish to keep since some elements could be checked after space needed...but so could the others?

        # Check for wind sanitization
        for i, item in enumerate(wxdata):
            # Skip Station
            if i == 0:
                continue
            if is_variable_wind_direction(item):
                replaced = item[:7]
                wxdata[i] = replaced
                sans.log(item, replaced)
                continue
            possible_wind = sanitize_wind(item)
            if is_wind(possible_wind):
                if item != possible_wind:
                    sans.log(item, possible_wind)
                wxdata[i] = possible_wind

        # Strip extra characters before dedupe
        stripped = [i.strip("./\\") for i in wxdata]
        if wxdata != stripped:
            sans.log_list(wxdata, stripped)
        deduped = dedupe(stripped, only_neighbors=True)
        if len(deduped) != len(wxdata):
            sans.duplicates_found = True
        return deduped

    return sanitize_report_list


# ========================================
# 婧愭枃浠?: parsing/sanitization/metar.py
# ========================================
"""METAR sanitization support."""

# module

METAR_REPL = {
    **CURRENT,
    "Z/ ": "Z ",
}


clean_metar_string = sanitize_string_with(METAR_REPL)


CLEANERS: CleanerListType = [
    OnlySlashes,
    EmptyWind,
    TrimWxCode,
    SeparatedDistance,
    SeparatedFirstTemperature,
    SeparatedCloudAltitude,
    SeparatedSecondTemperature,
    SeparatedAltimeterLetter,
    SeparatedTemperatureTrailingDigit,
    SeparatedWindUnit,
    SeparatedCloudQualifier,
    RemoveFromMetar,
    ReplaceItem,
    VisibilityGreaterThan,
    MisplaceWindKT,
    RunwayVisibilityUnit,
    DoubleGust,
    WindLeadingMistype,
    NonGGust,
    RemoveVrbLeadingDigits,
    JoinedCloud,
    JoinedTimestamp,
    JoinedWind,
    JoinedRunwayVisibility,
    ### Other wind fixes
]

clean_metar_list = sanitize_list_with(CLEANERS)


# ========================================
# 婧愭枃浠?: parsing/sanitization/taf.py
# ========================================
"""TAF sanitization support."""

# module

TAF_REPL = {
    **CURRENT,
    "Z/ ": "Z ",
    " PROBB": " PROB",
    " PROBN": " PROB",
    " PROB3P": "PROB30",
    " TMM": " TNM",
    " TMN": " TNM",
    " TXN": " TXM",
    " TNTN": " TN",
    " TXTX": " TX",
    " TXX": " TX",
}


clean_taf_string = sanitize_string_with(TAF_REPL)


CLEANERS: CleanerListType = [
    OnlySlashes,
    EmptyWind,
    TrimWxCode,
    SeparatedDistance,
    SeparatedFirstTemperature,
    SeparatedCloudAltitude,
    SeparatedSecondTemperature,
    SeparatedAltimeterLetter,
    SeparatedTemperatureTrailingDigit,
    SeparatedWindUnit,
    SeparatedCloudQualifier,
    SeparatedTafTimePrefix,
    SeparatedMinMaxTemperaturePrefix,
    RemoveFromTaf,
    ReplaceItem,
    RemoveTafAmend,
    VisibilityGreaterThan,
    MisplaceWindKT,
    DoubleGust,
    WindLeadingMistype,
    NonGGust,
    RemoveVrbLeadingDigits,
    JoinedCloud,
    JoinedTimestamp,
    JoinedWind,
    JoinedTafNewLine,
    JoinedMinMaxTemperature,
    ### Other wind fixes
]

clean_taf_list = sanitize_list_with(CLEANERS)


# ========================================
# 婧愭枃浠?: parsing/translate/base.py
# ========================================
"""Functions for translating report data."""

# stdlib


# module


def get_cardinal_direction(direction: float) -> str:
    """Return the cardinal direction (NSEW) for a degree direction.

    Wind Direction - Cheat Sheet:

    (360) -- 011/012 -- 033/034 -- (045) -- 056/057 -- 078/079 -- (090)

    (090) -- 101/102 -- 123/124 -- (135) -- 146/147 -- 168/169 -- (180)

    (180) -- 191/192 -- 213/214 -- (225) -- 236/237 -- 258/259 -- (270)

    (270) -- 281/282 -- 303/304 -- (315) -- 326/327 -- 348/349 -- (360)
    """
    ret = ""
    if not isinstance(direction, int):
        direction = int(direction)
    # Convert to range [0 360]
    while direction < 0:
        direction += 360
    direction = direction % 360
    if 304 <= direction <= 360 or 0 <= direction <= 56:
        ret += "N"
        if 304 <= direction <= 348:
            if 327 <= direction <= 348:
                ret += "N"
            ret += "W"
        elif 12 <= direction <= 56:
            if 12 <= direction <= 33:
                ret += "N"
            ret += "E"
    elif 124 <= direction <= 236:
        ret += "S"
        if 124 <= direction <= 168:
            if 147 <= direction <= 168:
                ret += "S"
            ret += "E"
        elif 192 <= direction <= 236:
            if 192 <= direction <= 213:
                ret += "S"
            ret += "W"
    elif 57 <= direction <= 123:
        ret += "E"
        if 57 <= direction <= 78:
            ret += "NE"
        elif 102 <= direction <= 123:
            ret += "SE"
    elif 237 <= direction <= 303:
        ret += "W"
        if 237 <= direction <= 258:
            ret += "SW"
        elif 282 <= direction <= 303:
            ret += "NW"
    return ret


WIND_DIR_REPR = {"000": "Calm", "VRB": "Variable"}


def wind(
    direction: Number | None,
    speed: Number | None,
    gust: Number | None,
    vardir: list[Number] | None = None,
    unit: str = "kt",
    *,
    cardinals: bool = True,
    spoken: bool = False,
) -> str:
    """Format wind elements into a readable sentence.

    Returns the translation string.

    Ex: NNE-020 (variable 010 to 040) at 14kt gusting to 20kt
    """
    ret = ""
    target = "spoken" if spoken else "repr"
    # Wind direction
    if direction:
        if direction.repr in WIND_DIR_REPR:
            ret += WIND_DIR_REPR[direction.repr]
        elif direction.value is None:
            ret += direction.repr
        else:
            if cardinals:
                ret += f"{get_cardinal_direction(direction.value)}-"
            ret += getattr(direction, target)
    # Variable direction
    if vardir and isinstance(vardir, list):
        vardir = [getattr(var, target) for var in vardir]
        ret += f" (variable {vardir[0]} to {vardir[1]})"
    # Speed
    if speed and speed.value:
        ret += f" at {speed.value}{unit}"
    # Gust
    if gust and gust.value:
        ret += f" gusting to {gust.value}{unit}"
    return ret


VIS_REPR = {
    "P6": "Greater than 6sm ( >10km )",
    "M1/2": "Less than .5sm ( <0.8km )",
    "M1/4": "Less than .25sm ( <0.4km )",
    "M1/8": "Less than .125sm ( <0.2km )",
}


def visibility(vis: Number | None, unit: str = "m") -> str:
    """Format a visibility element into a string with both km and sm values.

    Ex: 8km ( 5sm )
    """
    if not (vis and unit in {"m", "sm"}):
        return ""
    with suppress(KeyError):
        return VIS_REPR[vis.repr]
    if vis.value is None:
        return ""
    if unit == "m":
        meters = vis.value
        miles = meters * 0.000621371
        converted = str(round(miles, 1)).replace(".0", "") + "sm"
        value = str(round(meters / 1000, 1)).replace(".0", "")
        unit = "km"
    elif unit == "sm":
        miles = vis.value or 0
        kilometers = miles / 0.621371
        converted = str(round(kilometers, 1)).replace(".0", "") + "km"
        value = str(miles).replace(".0", "")
    else:
        return ""
    return f"{value}{unit} ({converted})"


def temperature(temp: Number | None, unit: str = "C") -> str:
    """Format a temperature element into a string with both C and F values.

    Used for both Temp and Dew.

    Ex: 34°C (93°F)
    """
    unit = unit.upper()
    if not (temp and temp.value is not None and unit in {"C", "F"}):
        return ""
    if unit == "C":
        fahrenheit = temp.value * 1.8 + 32
        converted = f"{int(round(fahrenheit))}°F"
    elif unit == "F":
        celsius = (temp.value - 32) / 1.8
        converted = f"{int(round(celsius))}°C"
    else:
        return ""
    return f"{temp.value}°{unit} ({converted})"


def altimeter(alt: Number | None, unit: str = "hPa") -> str:
    """Format the altimeter element into a string with hPa and inHg values.

    Ex: 30.11 inHg (10.20 hPa)
    """
    if not (alt and alt.value is not None and unit in {"hPa", "inHg"}):
        return ""
    if unit == "hPa":
        value = str(alt.value)
        inches = round(alt.value / 33.8638866667, 2)
        converted = str(inches).ljust(5, "0") + " inHg"
    elif unit == "inHg":
        value = str(alt.value).ljust(5, "0")
        pascals = alt.value * 33.8638866667
        converted = f"{int(round(pascals))} hPa"
    else:
        return ""
    return f"{value} {unit} ({converted})"


def clouds(values: list[Cloud] | None, unit: str = "ft") -> str:
    """Format cloud list into a readable sentence.

    Returns the translation string.

    Ex: Broken layer at 2200ft (Cumulonimbus), Overcast layer at 3600ft - Reported AGL
    """
    if values is None:
        return ""
    ret = []
    for cloud in values:
        if cloud.base is None:
            continue
        cloud_str = CLOUD_TRANSLATIONS[cloud.type]
        if cloud.modifier and cloud.modifier in CLOUD_TRANSLATIONS:
            cloud_str += f" ({CLOUD_TRANSLATIONS[cloud.modifier]})"
        ret.append(cloud_str.format(cloud.base * 100, unit))
    return ", ".join(ret) + " - Reported AGL" if ret else "Sky clear"


def wx_codes(codes: list[Code]) -> str:
    """Join WX code values,

    Returns the translation string,
    """
    return ", ".join(code.value for code in codes)


def current_shared(wxdata: SharedData, units: Units) -> ReportTrans:
    """Translate Visibility, Altimeter, Clouds, and Other,"""
    return ReportTrans(
        visibility=visibility(wxdata.visibility, units.visibility),
        altimeter=altimeter(wxdata.altimeter, units.altimeter),
        clouds=clouds(wxdata.clouds, units.altitude),
        wx_codes=wx_codes(wxdata.wx_codes),
    )


# ========================================
# 婧愭枃浠?: parsing/translate/metar.py
# ========================================
"""METAR data translation handlers."""



def translate_metar(wxdata: MetarData, units: Units) -> MetarTrans:
    """Return translations for a MetarData object."""
    shared = current_shared(wxdata, units)
    return MetarTrans(
        altimeter=shared.altimeter,
        clouds=shared.clouds,
        visibility=shared.visibility,
        wx_codes=shared.wx_codes,
        wind=wind(
            wxdata.wind_direction,
            wxdata.wind_speed,
            wxdata.wind_gust,
            wxdata.wind_variable_direction,
            units.wind_speed,
        ),
        temperature=temperature(wxdata.temperature, units.temperature),
        dewpoint=temperature(wxdata.dewpoint, units.temperature),
        remarks=translate(wxdata.remarks, wxdata.remarks_info),
    )


# ========================================
# 婧愭枃浠?: parsing/translate/taf.py
# ========================================
"""TAF data translation handlers."""

# stdlib

# module


def wind_shear(
    shear: str | None,
    unit_alt: str = "ft",
    unit_wind: str = "kt",
    *,
    spoken: bool = False,
) -> str:
    """Translate wind shear into a readable string.

    Ex: Wind shear 2000ft from 140 at 30kt
    """
    if not shear or "WS" not in shear or "/" not in shear:
        return ""
    altitude, wind = shear[2:].rstrip(unit_wind.upper()).split("/")
    wdir = spoken_number(wind[:3], literal=True) if spoken else wind[:3]
    return f"Wind shear {int(altitude)*100}{unit_alt} from {wdir} at {wind[3:]}{unit_wind}"


def turb_ice(values: list[str], unit: str = "ft") -> str:
    """Translate the list of turbulence or icing into a readable sentence.

    Ex: Occasional moderate turbulence in clouds from 3000ft to 14000ft
    """
    if not values:
        return ""
    # Determine turbulence or icing
    if values[0][0] == "5":
        conditions = TURBULENCE_CONDITIONS
    elif values[0][0] == "6":
        conditions = ICING_CONDITIONS
    else:
        return ""
    # Create list of split items (type, floor, height)
    split = [[item[1:2], item[2:5], item[5]] for item in values if len(item) == 6]
    # Combine items that cover a layer greater than 9000ft
    for i in reversed(range(len(split) - 1)):
        if (
            split[i][2] == "9"
            and split[i][0] == split[i + 1][0]
            and int(split[i + 1][1]) == (int(split[i][1]) + int(split[i][2]) * 10)
        ):
            split[i][2] = str(int(split[i][2]) + int(split[i + 1][2]))
            split.pop(i + 1)
    # Return joined, formatted string from split items
    return ", ".join(
        f"{conditions[item[0]]} from {int(item[1]) * 100}{unit} to {int(item[1]) * 100 + int(item[2]) * 1000}{unit}"
        for item in split
    )


def min_max_temp(temp: str | None, unit: str = "C") -> str:
    """Format the Min and Max temp elements into a readable string.

    Ex: Maximum temperature of 23°C (73°F) at 18-15:00Z
    """
    if not temp or len(temp) < 7:
        return ""
    if temp[:2] == "TX":
        temp_type = "Maximum"
    elif temp[:2] == "TN":
        temp_type = "Minimum"
    else:
        return ""
    value, time = temp[2:].replace("M", "-").replace("Z", "").replace("//", "/").strip("/").split("/")
    if len(time) > 2:
        time = f"{time[:2]}-{time[2:]}"
    translation = temperature(make_number(value), unit)
    return f"{temp_type} temperature of {translation} at {time}:00Z"


def translate_taf(wxdata: TafData, units: Units) -> TafTrans:
    """Return translations for a TafData object."""
    forecast: list[TafLineTrans] = []
    for line in wxdata.forecast:
        shared = current_shared(line, units)
        # Remove false 'Sky Clear' if line type is 'BECMG'
        clouds = shared.clouds
        if line.type == "BECMG" and clouds == "Sky clear":
            clouds = ""
        struct = TafLineTrans(
            altimeter=shared.altimeter,
            clouds=clouds,
            wx_codes=shared.wx_codes,
            visibility=shared.visibility,
            wind=wind(
                line.wind_direction,
                line.wind_speed,
                line.wind_gust,
                line.wind_variable_direction,
                unit=units.wind_speed,
            ),
            wind_shear=wind_shear(line.wind_shear, units.altitude, units.wind_speed),
            turbulence=turb_ice(line.turbulence, units.altitude),
            icing=turb_ice(line.icing, units.altitude),
        )
        forecast.append(struct)
    return TafTrans(
        forecast=forecast,
        max_temp=min_max_temp(wxdata.max_temp, units.temperature),
        min_temp=min_max_temp(wxdata.min_temp, units.temperature),
        remarks=translate(wxdata.remarks, wxdata.remarks_info),
    )


# ========================================
# 婧愭枃浠?: current/base.py
# ========================================
"""Current report shared resources."""

# stdlib


# module

if TYPE_CHECKING:
    from datetime import date




def _original_wx_code_logic(code: str) -> Code | str:
    """Original wx_code logic without slash handling."""
    if not code:
        return ""
    ret, code_copy = "", code
    if code[0] == "+":
        ret = "Heavy "
        code = code[1:]
    elif code[0] == "-":
        ret = "Light "
        code = code[1:]
    # Return code if code is not a code, ex R03/03002V03
    if len(code) not in [2, 4, 6] or code.isdigit():
        return code
    is_code = False
    while code:
        try:
            ret += f"{WX_TRANSLATIONS[code[:2]]} "
            is_code = True
        except KeyError:
            ret += code[:2]
        code = code[2:]
    # Return Code if any part was able to be translated
    return Code(code_copy, ret.strip()) if is_code else code_copy


def wx_code(code: str) -> Code | str:
    """Translate weather codes into readable strings.

    Returns translated string of variable length
    """
    return _original_wx_code_logic(code)


def get_wx_codes(codes: list[str]) -> tuple[list[str], list[Code]]:
    """Separate parsed WX codes."""
    other: list[str] = []
    ret: list[Code] = []
    for item in codes:
        code = wx_code(item)
        if isinstance(code, Code):
            ret.append(code)
        else:
            other.append(code)
    return other, ret


class Report(ManagedReport):
    """Base report to take care of service assignment and station info."""

    #: ReportTrans dataclass of translation strings from data. Parsed on update()
    translations: ReportTrans | None = None

    sanitization: Sanitization | None = None

    def __init__(self, code: str):
        """Add doc string to show constructor."""
        super().__init__(code)
        if self.station is not None:
            service = get_service(code, self.station.country)
            self.service = service(self.__class__.__name__.lower())  # type: ignore


class Reports(ManagedReport):
    """Base class containing multiple reports."""

    coord: Coord | None = None
    raw: list[str] | None = None  # type: ignore
    data: list[ReportData] | None = None  # type: ignore
    units: Units = Units.north_american()
    sanitization: list[Sanitization] | None = None

    def __init__(self, code: str | None = None, coord: Coord | None = None):
        if code:
            super().__init__(code)
            if self.station is not None:
                coord = self.station.coord
        elif coord is None:
            msg = "No station or coordinate given"
            raise ValueError(msg)
        self.coord = coord

    def __repr__(self) -> str:
        if self.code:
            return f"<avwx.{self.__class__.__name__} code={self.code}>"
        return f"<avwx.{self.__class__.__name__} coord={self.coord}>"

    @staticmethod
    def _report_filter(reports: list[str]) -> list[str]:
        """Apply any report filtering before updating raw_reports."""
        return reports

    async def _update(  # type: ignore
        self, reports: list[str], issued: date | None, *, disable_post: bool
    ) -> bool:
        if not reports:
            return False
        reports = self._report_filter(reports)
        return await super()._update(reports, issued, disable_post=disable_post)

    def parse(self, reports: str | list[str], issued: date | None = None) -> bool:
        """Update report data by parsing a given report.

        Can accept a report issue date if not a recent report string
        """
        return aio.run(self.async_parse(reports, issued))

    async def async_parse(self, reports: str | list[str], issued: date | None = None) -> bool:
        """Async update report data by parsing a given report.

        Can accept a report issue date if not a recent report string
        """
        self.source = None
        if isinstance(reports, str):
            reports = [reports]
        return await self._update(reports, issued, disable_post=False)

    def update(self, timeout: int = 10, *, disable_post: bool = False) -> bool:
        """Update report data by fetching and parsing the report.

        Returns True if new reports are available, else False
        """
        return aio.run(self.async_update(timeout, disable_post=disable_post))

    async def async_update(self, timeout: int = 10, *, disable_post: bool = False) -> bool:
        """Async update report data by fetching and parsing the report."""
        reports = await self.service.async_fetch(coord=self.coord, timeout=timeout)  # type: ignore
        self.source = self.service.root
        return await self._update(reports, None, disable_post=disable_post)


# ========================================
# 婧愭枃浠?: current/metar.py
# ========================================
"""
A METAR (Meteorological Aerodrome Report) is the surface weather observed at
most controlled (and some uncontrolled) airports. They are updated once per
hour or when conditions change enough to warrant an update, and the
observations are valid for one hour after the report was issued or until the
next report is issued.
"""

# stdlib


# module


class Metar(Report):
    @classmethod
    def from_report(cls, report, issued=None):
        obj = cls("UKWN")
        obj.raw = report
        obj.issued = issued
        obj.data, obj.units, obj.sanitization = parse("UKWN", report, issued)
        return obj
    """The Metar class offers an object-oriented approach to managing METAR data
    for a single station.

    Below is typical usage for fetching and pulling METAR data for KJFK.

    ```python
    >>> from avwx import Metar
    >>> kjfk = Metar("KJFK")
    >>> kjfk.station.name
    'John F Kennedy International Airport'
    >>> kjfk.update()
    True
    >>> kjfk.last_updated
    datetime.datetime(2018, 3, 4, 23, 36, 6, 62376)
    >>> kjfk.raw
    'KJFK 042251Z 32023G32KT 10SM BKN060 04/M08 A3008 RMK AO2 PK WND 32032/2251 SLP184 T00441078'
    >>> kjfk.data.flight_rules
    'VFR'
    >>> kjfk.translations.remarks
    {'AO2': 'Automated with precipitation sensor', 'SLP184': 'Sea level pressure: 1018.4 hPa', 'T00441078': 'Temperature 4.4°C and dewpoint -7.8°C'}
    ```

    The `parse` and `from_report` methods can parse a report string if you want
    to override the normal fetching process. Here's an example of a really bad
    day.

    ```python
    >>> from avwx import Metar
    >>> report = 'KSFO 031254Z 36024G55KT 320V040 1/8SM R06/0200D +TS VCFC OVC050 BKN040TCU 14/10 A2978 RMK AIRPORT CLOSED'
    >>> ksfo = Metar.from_report(report)
    True
    >>> ksfo.station.city
    'San Francisco'
    >>> ksfo.last_updated
    datetime.datetime(2018, 3, 4, 23, 54, 4, 353757, tzinfo=datetime.timezone.utc)
    >>> ksfo.data.flight_rules
    'LIFR'
    >>> ksfo.translations.clouds
    'Broken layer at 4000ft (Towering Cumulus), Overcast layer at 5000ft - Reported AGL'
    >>> ksfo.summary
    'Winds N-360 (variable 320 to 040) at 24kt gusting to 55kt, Vis 0.125sm, Temp 14C, Dew 10C, Alt 29.78inHg, Heavy Thunderstorm, Vicinity Funnel Cloud, Broken layer at 4000ft (Towering Cumulus), Overcast layer at 5000ft'
    ```
    """

    data: MetarData | None = None
    translations: MetarTrans | None = None

    async def _pull_from_default(self) -> None:
        """Check for a more recent report from NOAA."""
        service = Noaa(self.__class__.__name__.lower())
        if self.code is None:
            return
        report = await service.async_fetch(self.code)
        if report is not None:
            data, units, sans = parse(self.code, report, self.issued)
            if not data or data.time is None or data.time.dt is None:
                return
            if not self.data or self.data.time is None or self.data.time.dt is None or data.time.dt > self.data.time.dt:
                self.data, self.units, self.sanitization = data, units, sans
                self.source = service.root

    @property
    def _should_check_default(self) -> bool:
        """Return True if pulled from regional source and potentially out of date."""
        if isinstance(self.service, Noaa) or self.source is None:
            return False

        if self.data is None or self.data.time is None or self.data.time.dt is None:
            return True
        time_since = datetime.now(tz=timezone.utc) - self.data.time.dt
        return time_since > timedelta(minutes=90)

    def _calculate_altitudes(self) -> None:
        """Add the pressure and density altitudes to data if all fields are available."""
        if self.data is None or self.station is None or self.units is None:
            return
        # Select decimal temperature if available
        temp = self.data.temperature
        if self.data.remarks_info is not None:
            temp = self.data.remarks_info.temperature_decimal or temp
        alt = self.data.altimeter
        if temp is None or temp.value is None or alt is None or alt.value is None:
            return
        elev = self.station.elevation_ft
        if elev is None:
            return
        self.data.pressure_altitude = pressure_altitude(alt.value, elev, self.units.altimeter)
        self.data.density_altitude = density_altitude(alt.value, temp.value, elev, self.units)

    async def _post_update(self) -> None:
        if self.code is None or self.raw is None:
            return
        self.data, self.units, self.sanitization = parse(self.code, self.raw, self.issued)
        if self._should_check_default:
            await self._pull_from_default()
        if self.data is None or self.units is None:
            return
        self._calculate_altitudes()
        self.translations = translate_metar(self.data, self.units)

    def _post_parse(self) -> None:
        if self.code is None or self.raw is None:
            return
        self.data, self.units, self.sanitization = parse(self.code, self.raw, self.issued)
        if self.data is None or self.units is None:
            return
        self._calculate_altitudes()
        self.translations = translate_metar(self.data, self.units)

    @staticmethod
    def sanitize(report: str) -> str:
        """Sanitize a METAR string."""
        return sanitize(report)[0]

    @property
    def summary(self) -> str | None:
        """Condensed report summary created from translations."""
        if not self.translations:
            self.update()
        return None if self.translations is None else summary.metar(self.translations)

    @property
    def speech(self) -> str | None:
        """Report summary designed to be read by a text-to-speech program."""
        if not self.data:
            self.update()
        if self.data is None or self.units is None:
            return None
        return speech.metar(self.data, self.units)


def get_remarks(txt: str) -> tuple[list[str], str]:
    """Return the report split into components and the remarks string.

    Remarks can include items like RMK and on, NOSIG and on, and BECMG and on
    """
    txt = txt.replace("?", "").strip()
    # First look for Altimeter in txt
    alt_index = len(txt) + 1
    for item in [" A2", " A3", " Q1", " Q0", " Q9"]:
        index = txt.find(item)
        if len(txt) - 6 > index > -1 and txt[index + 2 : index + 6].isdigit():
            alt_index = index
    # Then look for earliest remarks 'signifier'
    sig_index = find_first_in_list(txt, METAR_RMK)
    if sig_index == -1:
        sig_index = len(txt) + 1
    if sig_index > alt_index > -1:
        return txt[: alt_index + 6].strip().split(), txt[alt_index + 7 :]
    if alt_index > sig_index > -1:
        return txt[:sig_index].strip().split(), txt[sig_index + 1 :]
    return txt.strip().split(), ""


_RVR_CODES = {
    "M": "less than",
    "A": "greater than",
    "P": "greater than",
    "U": "increasing",
    "I": "increasing",
    "D": "decreasing",
    "F": "decreasing",
    "R": "decreasing",
    "N": "no change",
    "V": "variable",
}


def _parse_rvr_number(value: str) -> Number | None:
    if not value:
        return None
    raw, prefix = value, None
    with suppress(KeyError):
        prefix = _RVR_CODES[value[0]]
        value = value[1:]
    number = make_number(value, raw)
    if number is not None and prefix is not None:
        number.spoken = f"{prefix} {number.spoken}"
        number.value = None
    return number


def parse_runway_visibility(value: str) -> RunwayVisibility:
    """Parse a runway visibility range string."""
    raw, trend = value, None
    # TODO: update to check and convert units post visibility parse
    value = value.replace("FT", "")
    with suppress(KeyError):
        trend = Code(value[-1], _RVR_CODES[value[-1]])
        value = value[:-1]
    runway, value, *_ = value[1:].split("/")
    if value:
        possible_numbers = [_parse_rvr_number(n) for n in value.split("V")]
        numbers = [n for n in possible_numbers if n is not None]
        visibility = numbers.pop() if len(numbers) == 1 else None
    else:
        visibility, numbers = None, []
    return RunwayVisibility(
        repr=raw,
        runway=runway,
        visibility=visibility,
        variable_visibility=numbers,
        trend=trend,
    )


def get_runway_visibility(data: list[str]) -> tuple[list[str], list[RunwayVisibility]]:
    """Return the report list and the remove runway visibility list."""
    runway_vis = [
        parse_runway_visibility(data.pop(i))
        for i, item in reversed(list(enumerate(data)))
        if is_runway_visibility(item)
    ]
    runway_vis.sort(key=lambda x: x.runway)
    return data, runway_vis


def parse_altimeter(value: str | None) -> Number | None:
    """Parse an altimeter string into a Number."""
    if not value or len(value) < 4:
        return None
    # QNH3003INS
    if len(value) >= 7 and value.endswith("INS"):
        return make_number(f"{value[-7:-5]}.{value[-5:-3]}", value, literal=True)
    number = value.replace(".", "")
    # Q1000/10
    if "/" in number:
        number = number.split("/")[0]
    if number.startswith("QNH"):
        number = f"Q{number[1:]}"
    if not (len(number) in {4, 5} and number[-4:].isdigit()):
        return None
    number = number.lstrip("AQ")
    if number[0] in ("2", "3"):
        number = f"{number[:2]}.{number[2:]}"
    elif number[0] not in ("0", "1"):
        return None
    return make_number(number, value, number, literal=True)


def get_altimeter(data: list[str], units: Units, version: str = "NA") -> tuple[list[str], Number | None]:
    """Return the report list and the removed altimeter item.

    Version is 'NA' (North American / default) or 'IN' (International)
    """
    values: list[Number] = []
    for _ in range(2):
        if not data:
            break
        value = parse_altimeter(data[-1])
        if value is None:
            break
        values.append(value)
        data.pop(-1)
    if not values:
        return data, None
    values.sort(key=lambda x: x.value or 0)
    altimeter = values[0 if version == "NA" else -1]
    if altimeter.value is not None:
        units.altimeter = "inHg" if altimeter.value < 100 else "hPa"
    return data, altimeter


def get_temp_and_dew(
    data: list[str],
) -> tuple[list[str], Number | None, Number | None]:
    """Return the report list and removed temperature and dewpoint strings."""
    for i, item in reversed(list(enumerate(data))):
        if "/" in item:
            # ///07
            if item[0] == "/":
                item = "/" + item.lstrip("/")  # noqa: PLW2901
            # 07///
            elif item[-1] == "/":
                item = item.rstrip("/") + "/"  # noqa: PLW2901
            tempdew = item.split("/")
            if len(tempdew) != 2:
                continue
            valid = True
            for j, temp in enumerate(tempdew):
                if temp in ["MM", "XX"]:
                    tempdew[j] = ""
                elif not is_possible_temp(temp):
                    valid = False
                    break
            if valid:
                data.pop(i)
                temp, dew = tempdew
                return data, make_number(temp), make_number(dew)
    return data, None, None


def get_relative_humidity(
    temperature: Number | None,
    dewpoint: Number | None,
    remarks_info: RemarksData | None,
    units: Units,
) -> float | None:
    """Calculate relative humidity from preferred temperature and dewpoint."""
    if remarks_info is not None:
        temp = remarks_info.temperature_decimal or temperature
        dew = remarks_info.dewpoint_decimal or dewpoint
    else:
        temp = temperature
        dew = dewpoint
    if temp is None or temp.value is None:
        return None
    if dew is None or dew.value is None:
        return None
    return relative_humidity(temp.value, dew.value, units.temperature)


def sanitize(report: str) -> tuple[str, str, list[str], Sanitization]:
    """Return a sanitized report, remarks, and elements ready for parsing."""
    sans = Sanitization()
    clean = clean_metar_string(report, sans)
    data, remark_str = get_remarks(clean)
    data = dedupe(data)
    data = clean_metar_list(data, sans)
    clean = " ".join(data)
    if remark_str:
        clean += f" {remark_str}"
    return clean, remark_str, data, sans


def parse(
    station: str,
    report: str,
    issued: date | None = None,
    use_na: bool | None = None,
) -> tuple[MetarData | None, Units | None, Sanitization | None]:
    """Return MetarData and Units dataclasses with parsed data and their associated units."""
    valid_station(station)
    if not report:
        return None, None, None
    if use_na is None:
        use_na = uses_na_format(station[:2])
    parser = parse_na if use_na else parse_in
    return parser(report, issued)


def parse_na(report: str, issued: date | None = None) -> tuple[MetarData, Units, Sanitization]:
    """Parser for the North American METAR variant."""
    units = Units.north_american()
    sanitized, remarks_str, data, sans = sanitize(report)
    data, station, time = get_station_and_time(data)
    data, runway_visibility = get_runway_visibility(data)
    data, clouds = get_clouds(data)
    (
        data,
        wind_direction,
        wind_speed,
        wind_gust,
        wind_variable_direction,
    ) = get_wind(data, units)
    data, altimeter = get_altimeter(data, units, "NA")
    data, visibility = get_visibility(data, units)
    data, temperature, dewpoint = get_temp_and_dew(data)
    condition = get_flight_rules(visibility, get_ceiling(clouds))
    other, wx_codes = get_wx_codes(data)
    remarks_info = parse(remarks_str)
    humidity = get_relative_humidity(temperature, dewpoint, remarks_info, units)
    struct = MetarData(
        altimeter=altimeter,
        clouds=clouds,
        dewpoint=dewpoint,
        flight_rules=FLIGHT_RULES[condition],
        other=other,
        raw=report,
        relative_humidity=humidity,
        remarks_info=remarks_info,
        remarks=remarks_str,
        runway_visibility=runway_visibility,
        sanitized=sanitized,
        station=station,
        temperature=temperature,
        time=make_timestamp(time, target_date=issued),
        visibility=visibility,
        wind_direction=wind_direction,
        wind_gust=wind_gust,
        wind_speed=wind_speed,
        wind_variable_direction=wind_variable_direction,
        wx_codes=wx_codes,
    )
    return struct, units, sans


def parse_in(report: str, issued: date | None = None) -> tuple[MetarData, Units, Sanitization]:
    """Parser for the International METAR variant."""
    units = Units.international()
    sanitized, remarks_str, data, sans = sanitize(report)
    data, station, time = get_station_and_time(data)
    data, runway_visibility = get_runway_visibility(data)
    if "CAVOK" not in data:
        data, clouds = get_clouds(data)
    (
        data,
        wind_direction,
        wind_speed,
        wind_gust,
        wind_variable_direction,
    ) = get_wind(data, units)
    data, altimeter = get_altimeter(data, units, "IN")
    if "CAVOK" in data:
        visibility = make_number("CAVOK")
        clouds = []
        data.remove("CAVOK")
    else:
        data, visibility = get_visibility(data, units)
    data, temperature, dewpoint = get_temp_and_dew(data)
    condition = get_flight_rules(visibility, get_ceiling(clouds))
    other, wx_codes = get_wx_codes(data)
    remarks_info = parse(remarks_str)
    humidity = get_relative_humidity(temperature, dewpoint, remarks_info, units)
    struct = MetarData(
        altimeter=altimeter,
        clouds=clouds,
        dewpoint=dewpoint,
        flight_rules=FLIGHT_RULES[condition],
        other=other,
        raw=report,
        relative_humidity=humidity,
        remarks_info=remarks_info,
        remarks=remarks_str,
        runway_visibility=runway_visibility,
        sanitized=sanitized,
        station=station,
        temperature=temperature,
        time=make_timestamp(time, target_date=issued),
        visibility=visibility,
        wind_direction=wind_direction,
        wind_gust=wind_gust,
        wind_speed=wind_speed,
        wind_variable_direction=wind_variable_direction,
        wx_codes=wx_codes,
    )
    return struct, units, sans


# ========================================
# 婧愭枃浠?: current/taf.py
# ========================================
"""
A TAF (Terminal Aerodrome Forecast) is a 24-hour weather forecast for the area
5 statute miles from the reporting station. They are update once every three or
six hours or when significant changes warrant an update, and the observations
are valid for six hours or until the next report is issued
"""

# stdlib


# module

if TYPE_CHECKING:
    from datetime import date


class Taf(Report):
    @classmethod
    def from_report(cls, report, issued=None):
        obj = cls("UKWN")
        obj.raw = report
        obj.issued = issued
        obj.data, obj.units, obj.sanitization = parse("UKWN", report, issued)
        return obj
    """
    The Taf class offers an object-oriented approach to managing TAF data for a
    single station.

    ```python
    >>> from avwx import Taf
    >>> kjfk = Taf("KJFK")
    >>> kjfk.station.name
    'John F Kennedy International Airport'
    >>> kjfk.update()
    True
    >>> kjfk.last_updated
    datetime.datetime(2018, 3, 4, 23, 43, 26, 209644, tzinfo=datetime.timezone.utc)
    >>> kjfk.raw
    'KJFK 042030Z 0421/0524 33016G27KT P6SM BKN045 FM051600 36016G22KT P6SM BKN040 FM052100 35013KT P6SM SCT035'
    >>> len(kjfk.data.forecast)
    3
    >>> kjfk.data.forecast[0].flight_rules
    'VFR'
    >>> kjfk.translations.forecast[0].wind
    'NNW-330 at 16kt gusting to 27kt'
    >>> kjfk.speech
    'Starting on March 4th - From 21 to 16 zulu, Winds three three zero at 16kt gusting to 27kt. Visibility greater than six miles. Broken layer at 4500ft. From 16 to 21 zulu, Winds three six zero at 16kt gusting to 22kt. Visibility greater than six miles. Broken layer at 4000ft. From 21 to midnight zulu, Winds three five zero at 13kt. Visibility greater than six miles. Scattered clouds at 3500ft'
    ```

    The `parse` and `from_report` methods can parse a report string if you want
    to override the normal fetching process.

    ```python
    >>> from avwx import Taf
    >>> report = "TAF ZYHB 082300Z 0823/0911 VRB03KT 9999 SCT018 BKN120 TX14/0907Z TN04/0921Z FM090100 09015KT 9999 -SHRA WS020/13045KT SCT018 BKN120 BECMG 0904/0906 34008KT PROB30 TEMPO 0906/0911 7000 -RA SCT020 650104 530804 RMK FCST BASED ON AUTO OBS. NXT FCST BY 090600Z"
    >>> zyhb = Taf.from_report(report)
    True
    >>> zyhb.station.city
    'Hulan'
    >>> zyhb.data.remarks
    'RMK FCST BASED ON AUTO OBS. NXT FCST BY 090600Z'
    >>> zyhb.summary[-1]
    'Vis 7km, Light Rain, Scattered clouds at 2000ft, Frequent moderate turbulence in clear air from 8000ft to 12000ft, Moderate icing in clouds from 1000ft to 5000ft'
    ```
    """

    data: TafData | None = None
    translations: TafTrans | None = None  # type: ignore

    async def _post_update(self) -> None:
        if self.code is None or self.raw is None:
            return
        self.data, self.units, self.sanitization = parse(self.code, self.raw, self.issued)
        if self.data is None or self.units is None:
            return
        self.translations = translate_taf(self.data, self.units)

    def _post_parse(self) -> None:
        if self.code is None or self.raw is None:
            return
        self.data, self.units, self.sanitization = parse(self.code, self.raw, self.issued)
        if self.data is None or self.units is None:
            return
        self.translations = translate_taf(self.data, self.units)

    @property
    def summary(self) -> list[str]:
        """Condensed summary for each forecast created from translations."""
        if not self.translations:
            self.update()
        if self.translations is None or self.translations.forecast is None:
            return []
        return [summary.taf(trans) for trans in self.translations.forecast]

    @property
    def speech(self) -> str | None:
        """Report summary designed to be read by a text-to-speech program."""
        if not self.data:
            self.update()
        if self.data is None or self.units is None:
            return None
        return speech.taf(self.data, self.units)


LINE_FIXES = {
    "TEMP0": "TEMPO",
    "TEMP O": "TEMPO",
    "TMPO": "TEMPO",
    "TE MPO": "TEMPO",
    "TEMP ": "TEMPO ",
    "T EMPO": "TEMPO",
    " EMPO": " TEMPO",
    "TEMO": "TEMPO",
    "BECM G": "BECMG",
    "BEMCG": "BECMG",
    "BE CMG": "BECMG",
    "B ECMG": "BECMG",
    " BEC ": " BECMG ",
    "BCEMG": "BECMG",
    "BEMG": "BECMG",
}


def sanitize_line(txt: str, sans: Sanitization) -> str:
    """Fix common mistakes with 'new line' signifiers so that they can be recognized."""
    for key, fix in LINE_FIXES.items():
        if key in txt:
            txt = txt.replace(key, fix)
            sans.log(key, fix)
    # Fix when space is missing following new line signifiers
    for item in ["BECMG", "TEMPO"]:
        if item in txt and f"{item} " not in txt:
            index = txt.find(item) + len(item)
            txt = f"{txt[:index]} {txt[index:]}"
            sans.extra_spaces_needed = True
    return txt


def get_taf_remarks(txt: str) -> tuple[str, str]:
    """Return report and remarks separated if found."""
    remarks_start = find_first_in_list(txt, TAF_RMK)
    if remarks_start == -1:
        return txt, ""
    remarks = txt[remarks_start:]
    txt = txt[:remarks_start].strip()
    return txt, remarks


def get_alt_ice_turb(
    data: list[str],
) -> tuple[list[str], Number | None, list[str], list[str]]:
    """Return the report list and removed: Altimeter string, Icing list, Turbulence list."""
    altimeter_number = None
    icing, turbulence = [], []
    for i, item in reversed(list(enumerate(data))):
        if len(item) > 6 and item.startswith("QNH") and item[3:7].isdigit():
            altimeter = data.pop(i)[3:7]
            if altimeter[0] in ("2", "3"):
                altimeter = f"{altimeter[:2]}.{altimeter[2:]}"
            altimeter_number = make_number(altimeter, literal=True)
        elif item.isdigit():
            if item[0] == "6":
                icing.append(data.pop(i))
            elif item[0] == "5":
                turbulence.append(data.pop(i))
    return data, altimeter_number, icing, turbulence


def is_normal_time(item: str) -> bool:
    """Return if the item looks like a valid TAF (1200/1400) time range."""
    return len(item) == 9 and item[4] == "/" and item[:4].isdigit() and item[5:].isdigit()


def starts_new_line(item: str) -> bool:
    """Returns True if the given element should start a new report line"""
    if item in TAF_NEWLINE:
        return True
    return any(item.startswith(start) for start in TAF_NEWLINE_STARTSWITH)


def split_taf(txt: str) -> list[str]:
    """Split a TAF report into each distinct time period."""
    lines = []
    split = txt.split()
    last_index = 0
    e_splits = enumerate(split)
    next(e_splits)
    for i, item in e_splits:
        if (starts_new_line(item) and not split[i - 1].startswith("PROB")) or (
            is_normal_time(item) and not starts_new_line(split[i - 1])
        ):
            lines.append(" ".join(split[last_index:i]))
            last_index = i
    lines.append(" ".join(split[last_index:]))
    return lines


# TAF line report type and start/end times
def get_type_and_times(
    data: list[str],
) -> tuple[list[str], str, str | None, str | None, str | None]:
    """Extract the report type string, start time string, and end time string."""
    report_type, start_time, end_time, transition = "FROM", None, None, None
    # TEMPO, BECMG, INTER
    if data and data[0] in TAF_NEWLINE or len(data[0]) == 6 and data[0].startswith("PROB"):
        report_type = data.pop(0)
    if data:
        item, length = data[0], len(data[0])
        # 1200/1306
        if is_normal_time(item):
            start_time, end_time = data.pop(0).split("/")

        # 1200 1306
        elif len(data) == 8 and length == 4 and len(data[1]) == 4 and item.isdigit() and data[1].isdigit():
            start_time = data.pop(0)
            end_time = data.pop(0)

        # 120000
        elif length == 6 and item.isdigit() and item[-2:] == "00":
            start_time = data.pop(0)[:4]
        # FM120000
        elif length > 7 and item.startswith("FM"):
            report_type = "FROM"
            if "/" in item and item[2:].split("/")[0].isdigit() and item[2:].split("/")[1].isdigit():
                start_time, end_time = data.pop(0)[2:].split("/")
            elif item[2:8].isdigit():
                start_time = data.pop(0)[2:6]
            # TL120600
            if data and length > 7 and data[0].startswith("TL") and data[0][2:8].isdigit():
                end_time = data.pop(0)[2:6]
        elif report_type == "BECMG" and length == 5:
            # 1200/
            if item[-1] == "/" and item[:4].isdigit():
                start_time = data.pop(0)[:4]
            # /1200
            elif item[0] == "/" and item[1:].isdigit():
                end_time = data.pop(0)[1:]
    if report_type == "BECMG":
        transition, start_time, end_time = start_time, end_time, None
    return data, report_type, start_time, end_time, transition


def _is_tempo_or_prob(line: TafLineData) -> bool:
    """Return True if report type is TEMPO, INTER or non-null probability."""
    return line.type == "TEMPO" or line.type == "INTER" or line.probability is not None


def _get_next_time(lines: list[TafLineData], target: str) -> Timestamp | None:
    """Returns the next normal time target value or empty"""
    for line in lines:
        if _is_tempo_or_prob(line):
            continue
        time = line.transition_start or getattr(line, target) if target == "start_time" else getattr(line, target)
        if time:
            return time  # type: ignore
    return None


def find_missing_taf_times(
    lines: list[TafLineData], start: Timestamp | None, end: Timestamp | None
) -> list[TafLineData]:
    """Fix any missing time issues except for error/empty lines."""
    if not lines:
        return lines
    # Assign start time
    lines[0].start_time = start
    # Fix other times
    last_fm_line = 0
    for i, line in enumerate(lines):
        if _is_tempo_or_prob(line):
            continue
        last_fm_line = i
        # Search remaining lines to fill empty end or previous for empty start
        for target, other, direc in (("start", "end", -1), ("end", "start", 1)):
            target += "_time"  # noqa: PLW2901
            if not getattr(line, target):
                setattr(line, target, _get_next_time(lines[i::direc][1:], f"{other}_time"))
    # Special case for final forcast
    if last_fm_line:
        lines[last_fm_line].end_time = end
    # Reset original end time if still empty
    if lines and not lines[0].end_time:
        lines[0].end_time = end
    return lines


def get_wind_shear(data: list[str]) -> tuple[list[str], str | None]:
    """Return the report list and the remove wind shear."""
    shear = None
    for i, item in reversed(list(enumerate(data))):
        if len(item) > 6 and item.startswith("WS") and item[5] == "/":
            shear = data.pop(i).replace("KT", "")
    return data, shear


def get_temp_min_and_max(
    data: list[str],
) -> tuple[list[str], str | None, str | None]:
    """Pull out Max temp at time and Min temp at time items from wx list."""
    temp_max, temp_min = "", ""
    for i, item in reversed(list(enumerate(data))):
        if len(item) > 6 and item[0] == "T" and "/" in item:
            # TX12/1316Z
            if item[1] == "X":
                temp_max = data.pop(i)
            # TNM03/1404Z
            elif item[1] == "N":
                temp_min = data.pop(i)
            # TM03/1404Z T12/1316Z -> Will fix TN/TX
            elif item[1] == "M" or item[1].isdigit():
                if temp_min:
                    if int(temp_min[2 : temp_min.find("/")].replace("M", "-")) > int(
                        item[1 : item.find("/")].replace("M", "-")
                    ):
                        temp_max, temp_min = f"TX{temp_min[2:]}", f"TN{item[1:]}"
                    else:
                        temp_max = f"TX{item[1:]}"
                else:
                    temp_min = f"TN{item[1:]}"
                data.pop(i)
    return data, temp_max or None, temp_min or None


def get_oceania_temp_and_alt(data: list[str]) -> tuple[list[str], list[str], list[str]]:
    """Get Temperature and Altimeter lists for Oceania TAFs."""
    tlist: list[str] = []
    qlist: list[str] = []
    if "T" in data:
        data, tlist = get_digit_list(data, data.index("T"))
    if "Q" in data:
        data, qlist = get_digit_list(data, data.index("Q"))
    return data, tlist, qlist


def get_taf_flight_rules(lines: list[TafLineData]) -> list[TafLineData]:
    """Get flight rules by looking for missing data in prior reports."""
    for i, line in enumerate(lines):
        temp_vis, temp_cloud, is_clear = line.visibility, line.clouds, False
        for report in reversed(lines[: i + 1]):
            if not _is_tempo_or_prob(report):
                if not temp_vis:
                    temp_vis = report.visibility
                # SKC or CLR should force no clouds instead of looking back
                if "SKC" in report.other or "CLR" in report.other or temp_vis and temp_vis.repr == "CAVOK":
                    is_clear = True
                elif temp_cloud == []:
                    temp_cloud = report.clouds
                if temp_vis and temp_cloud != []:
                    break
        if is_clear:
            temp_cloud = []
        line.flight_rules = FLIGHT_RULES[get_flight_rules(temp_vis, get_ceiling(temp_cloud))]
    return lines


def fix_report_header(report: str) -> str:
    """Correct the header order for key elements."""
    split_report = report.split()

    # Limit scope to only the first few elements. Remarks may include similar tokens
    header_length = min(len(split_report), 6)
    headers = split_report[:header_length]

    fixed_headers = []
    for target in ("TAF", "AMD", "COR"):
        with suppress(ValueError):
            headers.remove(target)
            fixed_headers.append(target)

    return " ".join(fixed_headers + headers + split_report[header_length:])


def _is_possible_start_end_time_slash(item: str) -> bool:
    """Return True if item is a possible period start or end with missing element."""
    return len(item) == 5 and (
        # 1200/
        (item[-1] == "/" and item[:4].isdigit())
        or
        # /1200
        (item[0] == "/" and item[1:].isdigit())
    )


def parse(
    station: str, report: str, issued: date | None = None
) -> tuple[TafData | None, Units | None, Sanitization | None]:
    """Return TafData and Units dataclasses with parsed data and their associated units."""
    if not report:
        return None, None, None
    valid_station(station)
    report = fix_report_header(report)
    is_amended, is_correction = False, False
    while len(report) > 3 and report[:4] in ("TAF ", "AMD ", "COR "):
        if report[:3] == "AMD":
            is_amended = True
        elif report[:3] == "COR":
            is_correction = True
        report = report[4:]
    
    # Handle CNL (cancel) reports
    if "CNL" in report:
        sans = Sanitization()
        sanitized = clean_taf_string(report, sans)
        _, new_station, time = get_station_and_time(sanitized[:20].split())
        if new_station is not None:
            station = new_station
        units = Units.north_american() if uses_na_format(station) else Units.international()
        
        # Create CNL-specific TafData structure
        struct = TafData(
            raw=report,
            sanitized=f"{station} {time} CNL" if time else f"{station} CNL",
            station=station,
            time=make_timestamp(time, target_date=issued) if time else None,
            remarks="CNL",
            remarks_info=None,
            forecast=[],  # Empty forecast list for CNL reports
            start_time=None,
            end_time=None,
            is_amended=is_amended,
            is_correction=is_correction,
            max_temp=None,
            min_temp=None,
            alts=None,
            temps=None,
        )
        return struct, units, sans
    
    start_time: Timestamp | None = None
    end_time: Timestamp | None = None
    sans = Sanitization()
    sanitized = clean_taf_string(report, sans)
    _, new_station, time = get_station_and_time(sanitized[:20].split())
    if new_station is not None:
        station = new_station
    sanitized = sanitized.replace(station, "")
    if time:
        sanitized = sanitized.replace(time, "").strip()
    units = Units.north_american() if uses_na_format(station) else Units.international()
    # Find and remove remarks
    sanitized, remarks = get_taf_remarks(sanitized)
    if remarks.startswith("AMD"):
        is_amended = True
    # Split and parse each line
    lines = split_taf(sanitized)
    parsed_lines = parse_lines(lines, units, sans, issued)
    # Perform additional info extract and corrections
    max_temp: str | None = None
    min_temp: str | None = None
    if parsed_lines:
        (
            parsed_lines[-1].other,
            max_temp,
            min_temp,
        ) = get_temp_min_and_max(parsed_lines[-1].other)
        if not (max_temp or min_temp):
            (
                parsed_lines[0].other,
                max_temp,
                min_temp,
            ) = get_temp_min_and_max(parsed_lines[0].other)
        # Set start and end times based on the first line
        start_time, end_time = parsed_lines[0].start_time, parsed_lines[0].end_time
        parsed_lines[0].end_time = None
        parsed_lines = find_missing_taf_times(parsed_lines, start_time, end_time)
        parsed_lines = get_taf_flight_rules(parsed_lines)
    # Extract Oceania-specific data
    alts: list[str] | None = None
    temps: list[str] | None = None
    if station[0] == "A":
        (
            parsed_lines[-1].other,
            alts,
            temps,
        ) = get_oceania_temp_and_alt(parsed_lines[-1].other)
    # Convert wx codes
    for line in parsed_lines:
        # 预处理：拆分斜杠分隔的天气现象
        def preprocess_slash_weather(other_list):
            """预处理斜杠分隔的天气现象"""
            new_list = []
            for item in other_list:
                if '/' in item:
                    # 条件1：检查/前面最近的2个字符是否都是字母
                    slash_pos = item.find('/')
                    if slash_pos >= 2:
                        before_slash = item[slash_pos-2:slash_pos]
                        condition1 = before_slash.isalpha()
                    else:
                        condition1 = False
                    
                    # 条件2：检查/后面第一个字符是否是+/-/字母
                    if slash_pos < len(item) - 1:
                        after_slash_char = item[slash_pos+1]
                        condition2 = after_slash_char in '+-' or after_slash_char.isalpha()
                    else:
                        condition2 = False
                    
                    # 只有当条件1和条件2都满足时才拆分
                    if condition1 and condition2:
                        parts = item.split('/')
                        # 过滤空字符串
                        valid_parts = [part for part in parts if part]
                        if len(valid_parts) > 1:
                            new_list.extend(valid_parts)
                        else:
                            new_list.append(item)
                    else:
                        new_list.append(item)
                else:
                    new_list.append(item)
            return new_list
        
        line.other = preprocess_slash_weather(line.other)
        line.other, line.wx_codes = get_wx_codes(line.other)
    sanitized = " ".join(i for i in (station, time, sanitized) if i)
    struct = TafData(
        raw=report,
        sanitized=sanitized,
        station=station,
        time=make_timestamp(time, target_date=issued),
        remarks=remarks,
        remarks_info=None,
        forecast=parsed_lines,
        start_time=start_time,
        end_time=end_time,
        is_amended=is_amended,
        is_correction=is_correction,
        max_temp=max_temp,
        min_temp=min_temp,
        alts=alts,
        temps=temps,
    )
    return struct, units, sans


def parse_lines(lines: list[str], units: Units, sans: Sanitization, issued: date | None = None) -> list[TafLineData]:
    """Return a list of parsed line dictionaries."""
    parsed_lines: list[TafLineData] = []
    prob = ""
    while lines:
        raw_line = lines[0].strip()
        line = sanitize_line(raw_line, sans)
        # Remove prob from the beginning of a line
        if line.startswith("PROB"):
            # Add standalone prob to next line
            if len(line) == 6:
                prob = line
                line = ""
            # Add to current line
            elif len(line) > 6:
                prob = line[:6]
                line = line[6:].strip()
        if line:
            parsed_line = parse_line(line, units, sans, issued)
            parsed_line.probability = None if " " in prob else make_number(prob[4:])
            parsed_line.raw = raw_line
            if prob:
                parsed_line.sanitized = f"{prob} {parsed_line.sanitized}"
            prob = ""
            parsed_lines.append(parsed_line)
        lines.pop(0)
    return parsed_lines


def parse_line(line: str, units: Units, sans: Sanitization, issued: date | None = None) -> TafLineData:
    """Parser for the International TAF forcast variant."""
    data: list[str] = dedupe(line.split())
    # Grab original time piece under certain conditions to preserve a useful slash
    old_time = data[1] if len(data) > 1 and _is_possible_start_end_time_slash(data[1]) else None
    data = clean_taf_list(data, sans)
    if old_time and len(data) > 1 and data[1] == old_time.strip("/"):
        data[1] = old_time
    sanitized = " ".join(data)
    data, report_type, start_time, end_time, transition = get_type_and_times(data)
    data, wind_shear = get_wind_shear(data)
    (
        data,
        wind_direction,
        wind_speed,
        wind_gust,
        wind_variable_direction,
    ) = get_wind(data, units)
    if "CAVOK" in data:
        visibility = make_number("CAVOK")
        clouds: list[Cloud] = []
        data.pop(data.index("CAVOK"))
    else:
        data, visibility = get_visibility(data, units)
        data, clouds = get_clouds(data)
    other, altimeter, icing, turbulence = get_alt_ice_turb(data)
    return TafLineData(
        altimeter=altimeter,
        clouds=clouds,
        flight_rules="",
        other=other,
        visibility=visibility,
        wind_direction=wind_direction,
        wind_gust=wind_gust,
        wind_speed=wind_speed,
        wx_codes=[],
        end_time=make_timestamp(end_time, target_date=issued),
        icing=icing,
        probability=None,
        raw=line,
        sanitized=sanitized,
        start_time=make_timestamp(start_time, target_date=issued),
        transition_start=make_timestamp(transition, target_date=issued),
        turbulence=turbulence,
        type=report_type,
        wind_shear=wind_shear,
        wind_variable_direction=wind_variable_direction,
    )


