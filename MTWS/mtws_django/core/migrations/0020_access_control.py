from django.db import migrations, models
import django.db.models.deletion


def seed_access_bootstrap(apps, schema_editor):
    from django.contrib.auth.hashers import make_password

    AccessGroup = apps.get_model('core', 'AccessGroup')
    AccessGroupPermission = apps.get_model('core', 'AccessGroupPermission')
    SystemConfig = apps.get_model('core', 'SystemConfig')

    modules = [
        ('login_user', True, False),
        ('metar_popup', True, True),
        ('nwp', True, False),
        ('refresh_btn', True, False),
        ('settings_btn', False, False),
        ('settings_airport_info', False, True),
        ('settings_area_options', False, True),
        ('settings_data_refresh', False, True),
        ('settings_carrier', False, True),
        ('settings_popup', False, True),
        ('settings_alert_thresholds', False, True),
        ('settings_weather_type', False, True),
        ('settings_weather_alert', False, True),
        ('settings_airport_location', False, True),
        ('import_alert', False, True),
        ('search', True, False),
        ('detail_sun', False, False),
        ('search_sun', False, False),
        ('detail_contact', False, False),
        ('search_contact', False, False),
        ('detail_metar_trend', True, False),
    ]

    group, _ = AccessGroup.objects.get_or_create(
        code='local',
        defaults={
            'name': '本机用户',
            'is_local': True,
            'require_qr': False,
            'is_builtin': True,
            'sort_order': 0,
        },
    )
    AccessGroupPermission.objects.filter(group=group).delete()
    AccessGroupPermission.objects.bulk_create([
        AccessGroupPermission(
            group=group,
            module_code=code,
            can_display=True,
            can_activate=has_act,
            can_write=has_write,
        )
        for code, has_act, has_write in modules
    ])

    if not SystemConfig.objects.filter(
        config_type='access_control', config_key='superuser_password_hash'
    ).exists():
        SystemConfig.objects.create(
            config_type='access_control',
            config_key='superuser_password_hash',
            config_value=make_password('admin2026'),
            description='超级用户口令哈希',
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_popup_settings_slim_and_whitelist'),
    ]

    operations = [
        migrations.CreateModel(
            name='AccessGroup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=64, unique=True, verbose_name='组代码')),
                ('name', models.CharField(max_length=100, verbose_name='组名称')),
                ('is_local', models.BooleanField(default=False, verbose_name='是否本机组')),
                ('require_qr', models.BooleanField(default=False, verbose_name='是否需要扫码')),
                ('is_builtin', models.BooleanField(default=False, verbose_name='是否内置')),
                ('sort_order', models.PositiveIntegerField(default=100, verbose_name='排序')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '访问用户组',
                'verbose_name_plural': '访问用户组',
                'db_table': 'access_group',
                'ordering': ['sort_order', 'id'],
            },
        ),
        migrations.CreateModel(
            name='NonLocalQrAuthLoginRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_id', models.CharField(max_length=32, verbose_name='用户ID')),
                ('role_name', models.CharField(max_length=100, verbose_name='登录角色')),
                ('group_id', models.IntegerField(blank=True, null=True, verbose_name='用户组ID')),
                ('auth_success_time', models.DateTimeField(auto_now_add=True, verbose_name='认证成功时间')),
            ],
            options={
                'verbose_name': '非本机扫码登录记录',
                'verbose_name_plural': '非本机扫码登录记录',
                'db_table': 'non_local_qr_auth_login_record',
                'ordering': ['-auth_success_time'],
            },
        ),
        migrations.CreateModel(
            name='NonLocalQrBlacklist',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_id', models.CharField(max_length=32, unique=True, verbose_name='用户ID')),
                ('remark', models.CharField(blank=True, max_length=200, null=True, verbose_name='备注')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '非本机扫码黑名单',
                'verbose_name_plural': '非本机扫码黑名单',
                'db_table': 'non_local_qr_blacklist',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AccessGroupPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('module_code', models.CharField(max_length=64, verbose_name='模块代码')),
                ('can_display', models.BooleanField(default=False, verbose_name='显示')),
                ('can_activate', models.BooleanField(default=False, verbose_name='激活后台')),
                ('can_write', models.BooleanField(default=False, verbose_name='写入')),
                ('group', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='permissions',
                    to='core.accessgroup',
                    verbose_name='用户组',
                )),
            ],
            options={
                'verbose_name': '用户组模块权限',
                'verbose_name_plural': '用户组模块权限',
                'db_table': 'access_group_permission',
                'unique_together': {('group', 'module_code')},
            },
        ),
        migrations.RunPython(seed_access_bootstrap, migrations.RunPython.noop),
    ]
