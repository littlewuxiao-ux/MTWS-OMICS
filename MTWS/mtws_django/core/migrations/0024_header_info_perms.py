"""日出日落 / 跑道 / 联系方式按 详情|搜索 × 主页|中文 拆成 12 个显示权限。

旧模块 detail_sun / detail_contact / search_sun / search_contact 的显示值
分别复制到对应页的主页档与中文档；跑道此前没有权限、一直显示，默认全开。
"""

from django.db import migrations

OLD_CODES = ('detail_sun', 'detail_contact', 'search_sun', 'search_contact')

NEW_FROM_OLD = {
    'detail_sun_home': 'detail_sun',
    'detail_sun_plain': 'detail_sun',
    'detail_contact_home': 'detail_contact',
    'detail_contact_plain': 'detail_contact',
    'search_sun_home': 'search_sun',
    'search_sun_plain': 'search_sun',
    'search_contact_home': 'search_contact',
    'search_contact_plain': 'search_contact',
}

RUNWAY_CODES = (
    'detail_runway_home',
    'detail_runway_plain',
    'search_runway_home',
    'search_runway_plain',
)


def add_header_info_permissions(apps, schema_editor):
    AccessGroup = apps.get_model('core', 'AccessGroup')
    AccessGroupPermission = apps.get_model('core', 'AccessGroupPermission')

    for group in AccessGroup.objects.all():
        old_rows = {
            row.module_code: row.can_display
            for row in AccessGroupPermission.objects.filter(
                group=group, module_code__in=OLD_CODES
            )
        }
        existing = set(
            AccessGroupPermission.objects.filter(group=group).values_list(
                'module_code', flat=True
            )
        )
        rows = []
        for new_code, old_code in NEW_FROM_OLD.items():
            if new_code in existing:
                continue
            display = old_rows.get(old_code, True)
            rows.append(AccessGroupPermission(
                group=group,
                module_code=new_code,
                can_display=display,
                can_activate=False,
                can_write=False,
            ))
        for code in RUNWAY_CODES:
            if code in existing:
                continue
            rows.append(AccessGroupPermission(
                group=group,
                module_code=code,
                can_display=True,
                can_activate=False,
                can_write=False,
            ))
        if rows:
            AccessGroupPermission.objects.bulk_create(rows)

    AccessGroupPermission.objects.filter(module_code__in=OLD_CODES).delete()


def restore_old_header_permissions(apps, schema_editor):
    AccessGroup = apps.get_model('core', 'AccessGroup')
    AccessGroupPermission = apps.get_model('core', 'AccessGroupPermission')
    new_codes = list(NEW_FROM_OLD.keys()) + list(RUNWAY_CODES)

    for group in AccessGroup.objects.all():
        new_rows = {
            row.module_code: row.can_display
            for row in AccessGroupPermission.objects.filter(
                group=group, module_code__in=new_codes
            )
        }
        existing = set(
            AccessGroupPermission.objects.filter(group=group).values_list(
                'module_code', flat=True
            )
        )
        restore = []
        mapping = {
            'detail_sun': ('detail_sun_home', 'detail_sun_plain'),
            'detail_contact': ('detail_contact_home', 'detail_contact_plain'),
            'search_sun': ('search_sun_home', 'search_sun_plain'),
            'search_contact': ('search_contact_home', 'search_contact_plain'),
        }
        for old_code, pair in mapping.items():
            if old_code in existing:
                continue
            display = new_rows.get(pair[0], True) or new_rows.get(pair[1], True)
            restore.append(AccessGroupPermission(
                group=group,
                module_code=old_code,
                can_display=display,
                can_activate=False,
                can_write=False,
            ))
        if restore:
            AccessGroupPermission.objects.bulk_create(restore)

    AccessGroupPermission.objects.filter(module_code__in=new_codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_view_modules'),
    ]

    operations = [
        migrations.RunPython(add_header_info_permissions, restore_old_header_permissions),
    ]
