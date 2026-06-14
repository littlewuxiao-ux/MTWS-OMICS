# backend/logic/metar_parser.py (SPECI/-SN 修复版)

import re

class METARParser:
    """
    通用METAR/SPECI报文解析器
    """

    def parse(self, text, for_scoring=False):
        # 1. 预处理：去除首尾空格和结尾等号
        text = text.strip().rstrip('=')
        # 标准化空格（多个空格转一个）
        text = re.sub(r'\s+', ' ', text)
        
        parsed = {
            'station': None,
            'time': None, # 格式: DDHHMMZ
            'wind_speed': 0,
            'visibility': 9999,
            'weather': 'NSW',
            'cloud_height': None,
            'cloud_amount': None
        }

        # 2. 头部解析 (支持 METAR, SPECI 或无前缀)
        # 尝试匹配标准头：(TYPE) STATION TIME
        head_match = re.match(r'^(?:(METAR|SPECI)\s+)?(?:COR\s+)?([A-Z]{4})\s+(\d{6}Z)', text)
        
        body = text
        if head_match:
            parsed['station'] = head_match.group(2)
            parsed['time'] = head_match.group(3)
            body = text[head_match.end():] # 截取正文
        trend_match = re.search(r'\b(NOSIG|BECMG|TEMPO|RMK)\b', body)
        if trend_match:
            body = body[:trend_match.start()] # 丢弃趋势词及其后面的所有内容，只保留纯实况
        else:
            # 模糊匹配：寻找行内第一个符合 "ABCD 123456Z" 格式的段落
            fuzzy = re.search(r'([A-Z]{4})\s+(\d{6}Z)', text)
            if fuzzy:
                parsed['station'] = fuzzy.group(1)
                parsed['time'] = fuzzy.group(2)
                body = text[fuzzy.end():]
            else:
                if for_scoring: return None
                raise ValueError(f"无法解析报文头: {text}")

        # 3. 要素解析 (正文部分)
        
        # A. 风 (Wind) - 匹配 MPS 或 KT
        # 例如: 33004MPS, 36010G18KT, VRB02MPS
        wind_match = re.search(r'\b(?:VRB|\d{3})(\d{2})(?:G(\d{2}))?(MPS|KT)\b', body)
        if wind_match:
            speed = int(wind_match.group(1))
            gust = int(wind_match.group(2)) if wind_match.group(2) else 0
            unit = wind_match.group(3)
            if unit == 'KT': # 简易换算
                speed = round(speed * 0.51444)
                gust = round(gust * 0.51444)
            parsed['wind_speed'] = max(speed, gust)

        # B. 能见度 (Visibility)
        if 'CAVOK' in body:
            parsed['visibility'] = 9999
            parsed['weather'] = 'NSW'
            parsed['cloud_amount'] = 'NSC'
        else:
            # 匹配独立的4位数字，排除 Q1013, 290700Z 等干扰
            # 逻辑：数字前后不能紧挨着字母（除了空格）
            vis_candidates = re.findall(r'(?<![A-Z])\b(\d{4})\b(?![A-Z])', body)
            if vis_candidates:
                parsed['visibility'] = int(vis_candidates[0])

        # C. 天气现象 (Weather)
        # 排除列表
        ignore_list = ['METAR', 'SPECI', 'COR', 'AUTO', 'NIL', 'NOSIG', 'CAVOK', 'SKC', 'CLR', 'NSC', 'MPS', 'KT', 'RMK']
        wx_found = []
        
        parts = body.split()
        for p in parts:
            if p in ignore_list: continue
            if p.startswith('RE') or p.startswith('Q') or p.startswith('A') or '/' in p: continue
            
            # 正则匹配天气代码：(修饰符)(描述符)(现象)
            # 例如: -SN, TSRA, BR, FG
            # 必须包含至少一个字母，且符合 METAR 代码规范
            if re.fullmatch(r'([+\-]|VC)?(MI|PR|BC|BL|DR|SH|TS|FZ)?([A-Z]{2}){1,3}', p):
                # 再次过滤掉纯风向变动 (如 350V040, 此时正则可能误判，需排除含数字情况)
                if not any(char.isdigit() for char in p):
                    wx_found.append(p)
        
        if wx_found:
            parsed['weather'] = ' '.join(wx_found)

        # D. 云 (Cloud)
        # 匹配 FEW030, OVC002, VV002, VV///
        cloud_matches = re.findall(r'\b(FEW|SCT|BKN|OVC|VV)(\d{3}|///)', body)
        if cloud_matches:
            min_h = float('inf')
            sel_amt = None
            
            for amt, h_str in cloud_matches:
                if h_str == '///':
                    h_val = 0 # VV/// 视为极低
                else:
                    h_val = int(h_str) * 100 # ft
                
                h_m = round(h_val * 0.3048) # m
                if h_m < min_h:
                    min_h = h_m
                    sel_amt = amt
            
            if min_h != float('inf'):
                parsed['cloud_height'] = min_h
                parsed['cloud_amount'] = sel_amt

        return parsed

    def get_weather_severity(self, weather_str):
        if not weather_str or weather_str == "NSW": return 0
        parts = weather_str.split()
        score = 0
        for p in parts:
            curr = 0
            if '+' in p: curr += 30
            elif '-' in p: curr += 10
            else: curr += 20
            
            if 'TS' in p: curr += 100
            if 'FZ' in p: curr += 90
            if 'SN' in p or 'SG' in p: curr += 80
            if 'RA' in p: curr += 50
            if 'FG' in p: curr += 40
            if 'BR' in p: curr += 30
            
            score = max(score, curr)
        return score
