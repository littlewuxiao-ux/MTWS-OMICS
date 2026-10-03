"""用户组权限按四大类补齐：去掉航班时刻图标，锁定激活后台，补地图子项与设置项。"""

from django.db import migrations


_NEW_CODES = (
    'map_radar',
    'map_radar_nav',
    'map_satellite',
    'view_trend_nav',
    'settings_radar_alert',
    'settings_map_style',
)


def _shown(Perm, group, code):
    if group.is_local:
        return True
    return Perm.objects.filter(group=group, module_code=code, can_display=True).exists()


def _ensure(Perm, group, code, display, activate, write):
    if Perm.objects.filter(group=group, module_code=code).exists():
        return
    Perm.objects.create(
        group=group,
        module_code=code,
        can_display=bool(display),
        can_activate=bool(activate),
        can_write=bool(write),
    )


def forwards(apps, schema_editor):
    AccessGroup = apps.get_model('core', 'AccessGroup')
    Perm = apps.get_model('core', 'AccessGroupPermission')
    Perm.objects.filter(module_code='flight_marks').delete()

    for group in AccessGroup.objects.all():
        for code in ('import_alert', 'view_trend'):
            row = Perm.objects.filter(group=group, module_code=code).first()
            if not row:
                continue
            # 激活后台与显示同步；写入仍按原授权，不因显示自动打开
            row.can_activate = bool(row.can_display)
            row.save(update_fields=['can_activate'])

        map_on = _shown(Perm, group, 'view_map')
        trend_on = _shown(Perm, group, 'view_trend')
        loc = Perm.objects.filter(group=group, module_code='settings_airport_location').first()
        loc_display = bool(group.is_local or (loc and loc.can_display))
        loc_write = bool(group.is_local or (loc and loc.can_write))

        _ensure(Perm, group, 'map_radar', map_on, map_on, bool(group.is_local and map_on))
        _ensure(Perm, group, 'map_radar_nav', map_on, False, False)
        _ensure(Perm, group, 'map_satellite', map_on, False, False)
        _ensure(Perm, group, 'view_trend_nav', trend_on, False, False)
        _ensure(Perm, group, 'settings_radar_alert', loc_display, False, loc_write)
        _ensure(Perm, group, 'settings_map_style', loc_display, False, loc_write)

        # 本机组：已有趋势视图显示时补上写入（处理记录）
        if group.is_local:
            trend = Perm.objects.filter(group=group, module_code='view_trend').first()
            if trend and trend.can_display and not trend.can_write:
                trend.can_write = True
                trend.save(update_fields=['can_write'])


def backwards(apps, schema_editor):
    Perm = apps.get_model('core', 'AccessGroupPermission')
    Perm.objects.filter(module_code__in=_NEW_CODES).delete()
    Perm.objects.filter(module_code='view_trend').update(can_activate=False)
    Perm.objects.filter(module_code='import_alert').update(can_activate=False)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0031_alert_handled'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
