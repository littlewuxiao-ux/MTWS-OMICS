from django.db import migrations


def delete_qita_area(apps, schema_editor):
    AreaOptions = apps.get_model('core', 'AreaOptions')
    AreaOptions.objects.filter(area='其它').delete()


def restore_qita_area(apps, schema_editor):
    AreaOptions = apps.get_model('core', 'AreaOptions')
    AreaOptions.objects.get_or_create(
        classification='国内',
        area='其它',
        defaults={'sequence': 9},
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_airport_location'),
    ]

    operations = [
        migrations.RunPython(delete_qita_area, reverse_code=restore_qita_area),
    ]
