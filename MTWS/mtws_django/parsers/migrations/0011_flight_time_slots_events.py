from django.db import migrations, models


def split_flight_detail(apps, schema_editor):
    Flight = apps.get_model('parsers', 'Flight')
    empty_slots = [''] * 48
    for row in Flight.objects.iterator():
        detail = row.flight_detail
        slots = empty_slots
        events = []
        if isinstance(detail, dict):
            raw_slots = detail.get('time_slots')
            if isinstance(raw_slots, list):
                slots = raw_slots
            raw_events = detail.get('events')
            if isinstance(raw_events, list):
                events = raw_events
        elif isinstance(detail, list):
            slots = detail
        Flight.objects.filter(pk=row.pk).update(time_slots=slots, events=events)


class Migration(migrations.Migration):

    dependencies = [
        ('parsers', '0010_metar_elements'),
    ]

    operations = [
        migrations.AddField(
            model_name='flight',
            name='time_slots',
            field=models.JSONField(blank=True, null=True, verbose_name='航班时段明细'),
        ),
        migrations.AddField(
            model_name='flight',
            name='events',
            field=models.JSONField(blank=True, null=True, verbose_name='航班时刻事件'),
        ),
        migrations.RunPython(split_flight_detail, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='flight',
            name='flight_detail',
        ),
    ]
