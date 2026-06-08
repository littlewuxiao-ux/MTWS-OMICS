"""
时间模式中间件
处理当前时间模式和测试时间模式的切换
"""

from django.utils.deprecation import MiddlewareMixin


class TimeModelMiddleware(MiddlewareMixin):
    """时间模式中间件"""
    
    def process_request(self, request):
        """处理请求，提取时间模式"""
        # 从URL路径中提取时间模式
        path_parts = request.path.strip('/').split('/')
        
        if path_parts and path_parts[0] in ['current', 'test']:
            request.time_mode = path_parts[0]
        else:
            request.time_mode = 'current'  # 默认使用当前时间模式
            
        return None
    
    def process_view(self, request, view_func, view_args, view_kwargs):
        """处理视图，将时间模式添加到view_kwargs中"""
        if hasattr(request, 'time_mode'):
            view_kwargs['time_mode'] = request.time_mode
        
        return None 