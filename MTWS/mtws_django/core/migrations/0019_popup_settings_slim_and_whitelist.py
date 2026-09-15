from django.db import migrations, models


def seed_whitelist(apps, schema_editor):
    PopupHandleWhitelist = apps.get_model('core', 'PopupHandleWhitelist')
    for ip, remark in (
        ('127.0.0.1', '本机'),
        ('10.88.24.65', ''),
    ):
        PopupHandleWhitelist.objects.get_or_create(
            ip_address=ip,
            defaults={'remark': remark},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_add_aircraft_parking_choice'),
    ]

    operations = [
        migrations.RemoveField(model_name='popupsettings', name='intercept'),
        migrations.RemoveField(model_name='popupsettings', name='operation_metar_popup'),
        migrations.RemoveField(model_name='popupsettings', name='operation_taf_popup'),
        migrations.RemoveField(model_name='popupsettings', name='operation_NWP_popup'),
        migrations.RemoveField(model_name='popupsettings', name='parking_metar_popup'),
        migrations.RemoveField(model_name='popupsettings', name='parking_taf_popup_other'),
        migrations.RemoveField(model_name='popupsettings', name='parking_NWP_popup'),
        migrations.RemoveField(model_name='popupsettings', name='operation_taf_popup_leeway'),
        migrations.RemoveField(model_name='popupsettings', name='operation_NWP_popup_leeway'),
        migrations.RemoveField(model_name='popupsettings', name='operation_taf_popup_level'),
        migrations.RemoveField(model_name='popupsettings', name='operation_NWP_popup_level'),
        migrations.RemoveField(model_name='popupsettings', name='parking_taf_popup_level'),
        migrations.RemoveField(model_name='popupsettings', name='parking_NWP_popup_level'),
        migrations.CreateModel(
            name='PopupHandleWhitelist',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ip_address', models.CharField(max_length=64, unique=True, verbose_name='IP地址')),
                ('remark', models.CharField(blank=True, max_length=50, null=True, verbose_name='备注')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '弹窗处理白名单',
                'verbose_name_plural': '弹窗处理白名单',
                'db_table': 'popup_handle_whitelist',
                'ordering': ['ip_address'],
            },
        ),
        migrations.RunPython(seed_whitelist, migrations.RunPython.noop),
    ]
