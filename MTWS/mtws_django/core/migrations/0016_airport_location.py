"""
迁移说明：
新增 AirportLocation 表（airport_location），存储机场四字代码与十进制经纬度坐标。
建表完成后通过 RunPython 从 airport_loc.csv（GBK 编码）导入全量数据，
DMS 格式坐标在导入时一次性转换为十进制度数。
"""
import csv
from pathlib import Path

from django.db import migrations, models


# ── DMS → 十进制度数转换（内嵌于迁移，不依赖外部模块）─────────────────────────

def _dms_to_decimal(dms_str: str):
    """
    将 DMS 格式坐标字符串转换为十进制度数，失败返回 None。

    格式：
      纬度  N/S + DDMMSSFF  （8 位数字，FF 为秒的百分之一）
      经度  E/W + DDDMMSSFF （9 位数字）

    示例：
      N43150800  → 43.252222
      E005471000 →  5.786111
      S00034395  → -0.062208
      W079275630 → -79.465639
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


# ── 数据导入函数 ──────────────────────────────────────────────────────────────

def import_from_csv(apps, schema_editor):
    """从 airport_loc.csv 导入机场坐标数据（GBK 编码，批量写入）"""
    AirportLocation = apps.get_model('core', 'AirportLocation')

    # 迁移文件位于 mtws_django/core/migrations/，CSV 在工作区根目录 data/ 下
    csv_path = (
        Path(__file__).resolve().parent  # migrations/
        .parent                          # core/
        .parent                          # mtws_django/
        .parent                          # 工作区根目录
        / 'data' / 'sqlite_database' / 'airport_loc.csv'
    )

    if not csv_path.exists():
        # CSV 文件不存在时跳过导入，不阻断迁移
        import warnings
        warnings.warn(
            f'airport_loc.csv 未找到（{csv_path}），跳过机场坐标导入。'
            '请稍后使用管理命令 import_airport_locations 手动导入。'
        )
        return

    batch = []
    seen_codes = set()

    with open(csv_path, newline='', encoding='gbk', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row.get('CODE_ICAO', '').strip()
            # 只保留 4 字符 ICAO 代码，跳过空行和重复行
            if not code or len(code) != 4 or code in seen_codes:
                continue
            lat = _dms_to_decimal(row.get('GEO_LAT', '').strip())
            lon = _dms_to_decimal(row.get('GEO_LONG', '').strip())
            if lat is None or lon is None:
                continue
            seen_codes.add(code)
            batch.append(AirportLocation(
                airport_4code=code,
                latitude=lat,
                longitude=lon,
                airport_name=(row.get('TXT_NAME', '').strip() or None),
            ))

    if batch:
        AirportLocation.objects.bulk_create(batch, ignore_conflicts=True)


def noop(apps, schema_editor):
    """回滚时无需操作（表会随 DeleteModel 一起消失）"""
    pass


# ── 迁移定义 ──────────────────────────────────────────────────────────────────

class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_rename_taf_avg_delay_to_import_check_interval'),
    ]

    operations = [
        migrations.CreateModel(
            name='AirportLocation',
            fields=[
                ('airport_4code', models.CharField(max_length=4, primary_key=True, serialize=False, verbose_name='机场四字代码')),
                ('latitude', models.FloatField(verbose_name='纬度（十进制度）')),
                ('longitude', models.FloatField(verbose_name='经度（十进制度）')),
                ('airport_name', models.CharField(blank=True, max_length=100, null=True, verbose_name='机场名称')),
            ],
            options={
                'verbose_name': '机场坐标',
                'verbose_name_plural': '机场坐标',
                'db_table': 'airport_location',
            },
        ),
        migrations.RunPython(import_from_csv, noop),
    ]
