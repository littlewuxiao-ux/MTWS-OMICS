"""实况趋势告警配置，并为已有用户组补齐视图与设置权限。"""

from django.db import migrations, models


def grant_trend_permissions(apps, schema_editor):
    AccessGroup = apps.get_model('core', 'AccessGroup')
    Perm = apps.get_model('core', 'AccessGroupPermission')
    for group in AccessGroup.objects.all():
        existing = set(
            Perm.objects.filter(
                group=group,
                module_code__in=('view_trend', 'settings_trend_alert'),
            ).values_list('module_code', flat=True)
        )
        rows = []
        if 'view_trend' not in existing:
            home = Perm.objects.filter(group=group, module_code='view_home', can_display=True).exists()
            rows.append(Perm(
                group=group,
                module_code='view_trend',
                can_display=bool(group.is_local or home),
                can_activate=False,
                can_write=False,
            ))
        if 'settings_trend_alert' not in existing:
            src = Perm.objects.filter(group=group, module_code='settings_weather_alert').first()
            rows.append(Perm(
                group=group,
                module_code='settings_trend_alert',
                can_display=bool(group.is_local or (src and src.can_display)),
                can_activate=False,
                can_write=bool(group.is_local or (src and src.can_write)),
            ))
        if rows:
            Perm.objects.bulk_create(rows)


def revoke_trend_permissions(apps, schema_editor):
    Perm = apps.get_model('core', 'AccessGroupPermission')
    Perm.objects.filter(module_code__in=('view_trend', 'settings_trend_alert')).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0027_map_style_config'),
    ]

    operations = [
        migrations.CreateModel(
            name='TrendAlertConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('config', models.JSONField(default=dict, verbose_name='配置JSON')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '实况趋势告警配置',
                'verbose_name_plural': '实况趋势告警配置',
                'db_table': 'trend_alert_config',
            },
        ),
        migrations.RunPython(grant_trend_permissions, revoke_trend_permissions),
    ]
