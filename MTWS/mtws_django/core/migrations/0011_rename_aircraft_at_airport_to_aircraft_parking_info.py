# Generated manually for renaming aircraft_at_airport to aircraft_parking_info

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_add_aircraft_at_airport_table'),
    ]

    operations = [
        # 重命名表
        migrations.RunSQL(
            "ALTER TABLE aircraft_at_airport RENAME TO aircraft_parking_info;",
            reverse_sql="ALTER TABLE aircraft_parking_info RENAME TO aircraft_at_airport;"
        ),
    ]
