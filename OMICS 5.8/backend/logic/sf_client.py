# backend/logic/sf_client.py (增加状态保持功能与详细日志)

import requests
import json
import base64
import time
import re
from datetime import datetime, timezone

class SFClient:
    """
    SF 航空气象数据接口客户端 & CAS 扫码登录管理器
    """
    def __init__(self):
        self.session = requests.session()
        self.get_qar_url = "https://cas.sf-express.com/cas/qrcode?type=cXJjb2Rl"
        self.listion_scan_qrcode_url = "https://cas.sf-express.com/cas/qrcode?type=dmFsaWRhdGlvbg"
        self.validate_url = "https://sfa-gwgw-inn.sf-airlines.com:8443/apis-auth/login/cas3.0"
        self.config_url = "https://cas.sf-express.com/cas/app/getConfig"
        self.data_api_url = "http://sfa-wgw-inn.sf-airlines.com:1080/met/dispatchMetTelSummary/airportMetList"
        # 🌟 新增：航班数据接口
        self.flight_api_url = "http://sfa-wgw-inn.sf-airlines.com:1080/flight/flightSchedule/getByFlightDate"
        
        self.current_config = {}
        self.current_qr_id = None
        
        # --- 新增：内存中缓存登录状态 ---
        self.cached_token = None
        self.cached_user_code = None

    def get_cas_config(self):
        data = {"serviceId": "sfa-gwgw-inn.sf-airlines.com"}
        try:
            response = self.session.post(url=self.config_url, json=data, timeout=10)
            json_str = json.loads(response.text)
            self.current_config = json_str
            return json_str
        except Exception as e:
            print(f"DEBUG: 获取配置失败: {e}")
            return None

    def get_qrcode(self):
        # 每次获取二维码时，意味着用户想要重新登录，清空旧状态
        self.cached_token = None
        
        if not self.current_config:
            self.get_cas_config()
            
        headers = {"routing": self.current_config.get("routing")}
        try:
            response = self.session.get(self.get_qar_url, headers=headers, timeout=10)
            json_data = json.loads(response.text).get("data")
            self.current_qr_id = json_data.get("id")
            return {
                "success": True,
                "qr_img_base64": json_data.get("img"),
                "uuid": json_data.get("id")
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def check_scan_status(self):
        if not self.current_qr_id or not self.current_config:
            return {"success": False, "status": "WAITING", "message": "配置丢失，请刷新"}

        params = {
            "routing": self.current_config.get("routing"),
            "id": self.current_qr_id,
            "responseHeaders": "true"
        }
        try:
            response = self.session.get(self.listion_scan_qrcode_url, params=params, timeout=5)
            response_data = json.loads(response.text)
            
            if response_data.get("success") == True:
                scan_data = response_data.get("data")
                # 临时保存工号，等待 validate 成功后确立
                self.cached_user_code = scan_data.get("userCode")
                
                return {
                    "success": True,
                    "status": "SCANNED",
                    "ticket": scan_data.get("ticket"),
                    "userCode": scan_data.get("userCode"),
                    "scan_id": scan_data.get("id")
                }
            else:
                return {"success": True, "status": "WAITING"}
        except Exception as e:
            return {"success": False, "status": "ERROR", "message": str(e)}

    def validate_login_and_get_token(self, ticket, scan_id):
        headers = {"routing": self.current_config.get("routing")}
        try:
            decode_once = base64.b64decode(scan_id).decode("ascii")
            decode_twice = base64.b64decode(decode_once).decode("ascii")
            data = {
                "st": ticket,
                "service": decode_twice,
                "appKey": "mtws_foc2",
                "appSecret": "mtwsFoc2#123"
            }
            response = self.session.post(self.validate_url, headers=headers, json=data, timeout=10)
            json_str = json.loads(response.text)
            if json_str.get("success"):
                token = json_str.get("obj").get("token")
                # --- 登录成功，持久化 Token ---
                self.cached_token = token
                return {"success": True, "token": token}
            else:
                return {"success": False, "message": json_str.get("errorMessage", "验证失败")}
        except Exception as e:
            return {"success": False, "message": str(e)}

    # --- 获取当前会话状态 ---
    def get_session_status(self):
        if self.cached_token:
            return {
                "logged_in": True,
                "token": self.cached_token,
                "userCode": self.cached_user_code or "--"
            }
        return {"logged_in": False}

    # --- 注销 ---
    def logout(self):
        self.cached_token = None
        self.cached_user_code = None

    # ==================================================
    # 🌟 核心业务接口：气象数据 (TAF/METAR) 获取
    # ==================================================
    def fetch_weather_data(self, token, start_dt, end_dt, target_airports_list, wtypes=None):
        if not token:
            raise ValueError("未提供认证 Token")
        
        if wtypes is None:
            wtypes = ["SA", "SP"]

        start_ts = int(start_dt.timestamp() * 1000)
        end_ts = int(end_dt.timestamp() * 1000)
        
        clean_airports = [code.strip().upper() for code in target_airports_list]
        code4s_str = " ".join(clean_airports)

        headers = {
            "Content-Type": "application/json",
            "token": token.strip()
        }

        # 扩大查询范围，依赖本地过滤
        api_start_ts = start_ts - 3600000 
        api_end_ts = end_ts + 3600000

        payload = {
            "code4s": code4s_str,
            "wsTypes": wtypes,
            "historyFlag": "Y",
            "searchStartDate": api_start_ts, 
            "searchEndDate": api_end_ts,
            "metarOrTafTopNum": 100000,
            "otherTopNum": 100000
        }

        try:
            print("================================================")
            print(f"DEBUG: [TAF API 请求] 准备拉取报文")
            print(f"       请求类型: {wtypes}")
            print(f"       目标机场: {code4s_str}")
            print(f"       请求 Token: {token[:15]}...")

            response = requests.post(self.data_api_url, headers=headers, json=payload, timeout=30)
            print(f"DEBUG: [TAF API 响应] 状态码: {response.status_code}")
            response.raise_for_status()
            
            data = response.json()
            items = data.get('obj')
            if items is None:
                items = data.get('data') or data.get('result') or []

            print(f"DEBUG: [TAF API 成功] 收到 {len(items)} 条原始数据")

            result_lines = []
            for item in items:
                if not isinstance(item, dict): continue
                
                api_airport = str(item.get('airport4Code', '')).strip().upper()
                content = item.get('content')
                
                if api_airport in clean_airports and content:
                    clean_content = content.strip()
                    if self._is_time_in_range(clean_content, start_ts, end_ts, start_dt):
                        result_lines.append(clean_content)

            print(f"DEBUG: [过滤结果] 有效报文 {len(result_lines)} 条")
            print("================================================")
            
            return "\n".join(result_lines)

        except Exception as e:
            print(f"ERROR: [TAF API 失败] {str(e)}")
            print("================================================")
            raise Exception(f"API 请求或解析失败: {str(e)}")

    # ==================================================
    # 🌟 修改后的航班运行计划获取接口 (严格遵循 API 文档)
    # ==================================================
    def fetch_flight_schedule(self, token, date_str=None):
        """
        根据当前时间获取顺丰运行航班计划
        """
        if not token:
            raise ValueError("未提供认证 Token")
            
        # 严格按照接口文档添加 systemKey 和 accessKey
        headers = {
            "Content-Type": "application/json",
            "token": token.strip(),
            "systemKey": "629dd582-f044-41ec-aebb-1f352e26ca92",
            "accessKey": "api2_935b8fc3-a8dc-41d5-a6d0-1c91b1d3e209"
        }
        
        # 按照接口文档要求：前24小时 到 后48小时
        now_ts = int(time.time() * 1000)
        start_time_ts = now_ts - (24 * 3600 * 1000)
        end_time_ts = now_ts + (48 * 3600 * 1000)
        
        # 严格遵守 API 规定的 Body 格式
        payload = {
            "startTime": start_time_ts,
            "endTime": end_time_ts,
            "excludeCancel": True,
            "excludeHaveAta": True
        }
        
        print("================================================")
        print(f"DEBUG: [航班 API 请求] 准备拉取航班")
        print(f"       时间范围: {start_time_ts} -> {end_time_ts}")
        print(f"       请求 Token: {token[:15]}...")
        
        try:
            response = requests.post(self.flight_api_url, headers=headers, json=payload, timeout=30)
            print(f"DEBUG: [航班 API 响应] 状态码: {response.status_code}")
            response.raise_for_status()
            
            data = response.json()
            # 根据接口文档，成功返回信息在 obj 中
            items = data.get('obj') or data.get('data') or data.get('result') or []
            
            print(f"DEBUG: [航班 API 成功] 获取到航班数据 {len(items)} 条")
            # ==================================================
            # 🌟 新增超级探针：打印出第一条航班数据的字段样本，直接暴露真相！
            # ==================================================
            if len(items) > 0:
                print("DEBUG: [航班探针] 第一条航班数据结构样本:")
                sample = items[0]
                # 只打印前10个键值对防止刷屏
                probe_keys = list(sample.keys())[:10]
                probe_data = {k: sample[k] for k in probe_keys}
                print(f"       {probe_data} ...")
            # ==================================================
            print("================================================")
            return items
            
        except Exception as e:
            print(f"ERROR: [航班 API 失败] {str(e)}")
            print("================================================")
            raise Exception(f"航班数据请求失败: {str(e)}")

    # ==================================================
    # 工具函数：时间判定
    # ==================================================
    def _is_time_in_range(self, content, start_ts, end_ts, ref_datetime):
        try:
            match = re.search(r'\b(\d{2})(\d{2})(\d{2})Z\b', content)
            if not match: return True 

            d, h, m = int(match.group(1)), int(match.group(2)), int(match.group(3))
            
            current_year = ref_datetime.year
            current_month = ref_datetime.month
            
            try:
                candidate = datetime(current_year, current_month, d, h, m, tzinfo=timezone.utc)
            except ValueError: return True

            if d < ref_datetime.day - 5: 
                if current_month == 12:
                    candidate = datetime(current_year + 1, 1, d, h, m, tzinfo=timezone.utc)
                else:
                    candidate = datetime(current_year, current_month + 1, d, h, m, tzinfo=timezone.utc)
            elif d > ref_datetime.day + 5:
                if current_month == 1:
                    candidate = datetime(current_year - 1, 12, d, h, m, tzinfo=timezone.utc)
                else:
                    candidate = datetime(current_year, current_month - 1, d, h, m, tzinfo=timezone.utc)

            candidate_ts = int(candidate.timestamp() * 1000)
            
            if start_ts <= candidate_ts <= end_ts:
                return True
            else:
                return False

        except Exception as e:
            return True

sf_client_instance = SFClient()