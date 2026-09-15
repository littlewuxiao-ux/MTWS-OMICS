"""为已有用户组补齐三个显示视图权限。

新增模块 view_home / view_map / view_plain 后，老用户组在 access_group_permission
里没有对应行，权限会被算成全关，登录后无视图可进。此处按迁移前的实际可见性补齐：
列表主页与地图模式此前对所有能进主页的用户都开放，因此补成显示；中文模式是新功能，
非本机组默认关闭，由超级用户按需开启。本机组出厂全开。
"""

from django.db import migrations

VIEW_CODES = ('view_home', 'view_map', 'view_plain')


def add_view_permissions(apps, schema_editor):
    AccessGroup = apps.get_model('core', 'AccessGroup')
    AccessGroupPermission = apps.get_model('core', 'AccessGroupPermission')

    for group in AccessGroup.objects.all():
        existing = set(
            AccessGroupPermission.objects.filter(
                group=group, module_code__in=VIEW_CODES
            ).values_list('module_code', flat=True)
        )
        rows = []
        for code in VIEW_CODES:
            if code in existing:
                continue
            if group.is_local:
                display = True
                activate = code == 'view_plain'
            else:
                display = code in ('view_home', 'view_map')
                activate = False
            rows.append(AccessGroupPermission(
                group=group,
                module_code=code,
                can_display=display,
                can_activate=activate,
                can_write=False,
            ))
        if rows:
            AccessGroupPermission.objects.bulk_create(rows)


def remove_view_permissions(apps, schema_editor):
    AccessGroupPermission = apps.get_model('core', 'AccessGroupPermission')
    AccessGroupPermission.objects.filter(module_code__in=VIEW_CODES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_delete_popuphandlewhitelist'),
    ]

    operations = [
        migrations.RunPython(add_view_permissions, remove_view_permissions),
    ]
