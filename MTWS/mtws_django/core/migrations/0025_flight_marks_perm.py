"""为已有用户组补齐 flight_marks 权限。

本机组默认开启显示，便于本地试运行；非本机组默认关闭，由超管按试用组开启。
"""

from django.db import migrations

MODULE_CODE = 'flight_marks'


def add_flight_marks_permissions(apps, schema_editor):
    AccessGroup = apps.get_model('core', 'AccessGroup')
    AccessGroupPermission = apps.get_model('core', 'AccessGroupPermission')

    for group in AccessGroup.objects.all():
        if AccessGroupPermission.objects.filter(group=group, module_code=MODULE_CODE).exists():
            continue
        AccessGroupPermission.objects.create(
            group=group,
            module_code=MODULE_CODE,
            can_display=bool(group.is_local),
            can_activate=False,
            can_write=False,
        )


def remove_flight_marks_permissions(apps, schema_editor):
    AccessGroupPermission = apps.get_model('core', 'AccessGroupPermission')
    AccessGroupPermission.objects.filter(module_code=MODULE_CODE).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0024_header_info_perms'),
    ]

    operations = [
        migrations.RunPython(add_flight_marks_permissions, remove_flight_marks_permissions),
    ]
