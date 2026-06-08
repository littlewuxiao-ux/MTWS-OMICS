from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_wxmsgimportalert'),
    ]

    operations = [
        migrations.DeleteModel(
            name='UserAccessLog',
        ),
    ]
