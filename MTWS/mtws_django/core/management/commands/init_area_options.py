"""
初始化区域选项数据管理命令
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import AreaOptions


class Command(BaseCommand):
    help = '初始化区域选项数据'

    def handle(self, *args, **options):
        """命令执行入口"""
        
        self.create_area_options_data()
        
        self.stdout.write(
            self.style.SUCCESS('区域选项数据初始化完成')
        )

    def create_area_options_data(self):
        """创建区域选项数据 - 仅在表为空时初始化默认数据"""
        
        try:
            # 检查是否已有数据
            if AreaOptions.objects.exists():
                self.stdout.write(
                    self.style.WARNING('区域选项数据已存在，跳过初始化')
                )
                return
            
            with transaction.atomic():
                # 仅在表为空时创建默认数据
                default_areas = [
                    # 国内区域
                    {'classification': '国内', 'sequence': 1, 'area': '华中'},
                    {'classification': '国内', 'sequence': 2, 'area': '华南'},
                    {'classification': '国内', 'sequence': 3, 'area': '华东'},
                    {'classification': '国内', 'sequence': 4, 'area': '华北'},
                    {'classification': '国内', 'sequence': 5, 'area': '东北'},
                    {'classification': '国内', 'sequence': 6, 'area': '西南'},
                    {'classification': '国内', 'sequence': 7, 'area': '西北'},
                    {'classification': '国内', 'sequence': 8, 'area': '港台'},
                    {'classification': '国内', 'sequence': 9, 'area': '其它'},
                    # 国际区域
                    {'classification': '国际', 'sequence': 1, 'area': '东亚'},
                    {'classification': '国际', 'sequence': 2, 'area': '东南亚'},
                    {'classification': '国际', 'sequence': 3, 'area': '南亚'},
                    {'classification': '国际', 'sequence': 4, 'area': '中东'},
                    {'classification': '国际', 'sequence': 5, 'area': '中/西亚'},
                    {'classification': '国际', 'sequence': 6, 'area': '欧洲'},
                    {'classification': '国际', 'sequence': 7, 'area': '北美'},
                    {'classification': '国际', 'sequence': 8, 'area': '南美'},
                    {'classification': '国际', 'sequence': 9, 'area': '澳洲'},
                    {'classification': '国际', 'sequence': 10, 'area': '非洲'},
                ]
                
                # 创建默认数据
                for area_data in default_areas:
                    AreaOptions.objects.create(**area_data)
                
                self.stdout.write(
                    self.style.SUCCESS(f'成功初始化 {len(default_areas)} 条默认区域选项数据')
                )
                
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'初始化区域选项数据失败: {str(e)}')
            )
