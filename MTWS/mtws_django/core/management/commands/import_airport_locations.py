"""
管理命令：import_airport_locations
从 airport_loc.csv（GBK 编码）向 airport_location 表导入机场坐标数据。
DMS 格式坐标在导入时一次性转换为十进制度数。

用法：
  python manage.py import_airport_locations              # 增量导入（跳过已存在）
  python manage.py import_airport_locations --clear     # 清空后全量重导
"""

import csv
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core.models import AirportLocation


_CSV_PATH = (
    Path(__file__).resolve()
    .parent.parent.parent.parent.parent  # 工作区根目录
    / 'data' / 'sqlite_database' / 'airport_loc.csv'
)


def _dms_to_decimal(dms_str: str):
    """
    DMS 格式坐标 → 十进制度数，解析失败返回 None。

    格式：
      纬度  N/S + DDMMSSFF  （8 位数字，FF 为秒的百分之一）
      经度  E/W + DDDMMSSFF （9 位数字）
    """
    if not dms_str or len(dms_str) < 7:
        return None
    direction = dms_str[0].upper()
    digits = dms_str[1:]
    try:
        if direction in ('N', 'S'):
            d = int(digits[0:2])
            m = int(digits[2:4])
            s = int(digits[4:6])
            f = int(digits[6:8]) if len(digits) >= 8 else 0
        elif direction in ('E', 'W'):
            d = int(digits[0:3])
            m = int(digits[3:5])
            s = int(digits[5:7])
            f = int(digits[7:9]) if len(digits) >= 9 else 0
        else:
            return None
        decimal = d + m / 60.0 + (s + f / 100.0) / 3600.0
        if direction in ('S', 'W'):
            decimal = -decimal
        return round(decimal, 6)
    except (ValueError, IndexError):
        return None


class Command(BaseCommand):
    help = '从 airport_loc.csv 导入机场坐标到 airport_location 表'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='导入前清空 airport_location 表（全量重导）',
        )
        parser.add_argument(
            '--csv',
            type=str,
            default=str(_CSV_PATH),
            help=f'CSV 文件路径（默认：{_CSV_PATH}）',
        )

    def handle(self, *args, **options):
        csv_path = Path(options['csv'])
        if not csv_path.exists():
            raise CommandError(f'CSV 文件未找到：{csv_path}')

        if options['clear']:
            deleted, _ = AirportLocation.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'已清空 airport_location 表（删除 {deleted} 条）'))

        batch = []
        seen_codes = set()
        skipped_invalid = 0
        skipped_dup = 0

        with open(csv_path, newline='', encoding='gbk', errors='replace') as f:
            reader = csv.DictReader(f)
            for row in reader:
                code = row.get('CODE_ICAO', '').strip()
                if not code or len(code) != 4:
                    skipped_invalid += 1
                    continue
                if code in seen_codes:
                    skipped_dup += 1
                    continue

                lat = _dms_to_decimal(row.get('GEO_LAT', '').strip())
                lon = _dms_to_decimal(row.get('GEO_LONG', '').strip())
                if lat is None or lon is None:
                    skipped_invalid += 1
                    continue

                seen_codes.add(code)
                batch.append(AirportLocation(
                    airport_4code=code,
                    latitude=lat,
                    longitude=lon,
                    airport_name=(row.get('TXT_NAME', '').strip() or None),
                ))

        created = 0
        if batch:
            result = AirportLocation.objects.bulk_create(batch, ignore_conflicts=True)
            created = len(result)

        self.stdout.write(
            self.style.SUCCESS(
                f'导入完成：写入 {created} 条 | '
                f'无效/坐标缺失 {skipped_invalid} 条 | '
                f'文件内重复 {skipped_dup} 条'
            )
        )
