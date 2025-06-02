import os
import requests
import subprocess
import sys
import shutil
import tkinter as tk
from tkinter import ttk, messagebox
import json
import threading
import concurrent.futures
from typing import Dict, List, Tuple, Optional, Any, Union
import time

# 导入 ttkbootstrap
import ttkbootstrap as tb
from ttkbootstrap.constants import *


class APKDownloader:
    """APK 下载管理器类，处理版本检查和下载逻辑"""
    
    # 配置常量
    VERSION_DIR = "F:/Program Files/Git/storage/SH下载文件/版本文件夹"
    DOWNLOAD_DIR = "F:/Program Files/Git/storage/SH下载文件"
    USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/555.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/555.36 EdgA/121.0.0.0"
    
    # 版本信息URL
    URLS = {
        "OK版手机": "https://raw.githubusercontent.com/lystv/fmapp/main/apk/release/mobile.json",
        "OK版电视": "https://raw.githubusercontent.com/lystv/fmapp/main/apk/release/leanback.json",
        "蜜蜂版手机": "https://raw.githubusercontent.com/FongMi/Release/fongmi/apk/release/mobile.json",
        "蜜蜂版电视": "https://raw.githubusercontent.com/FongMi/Release/fongmi/apk/release/leanback.json",
        "OK版Pro": "https://raw.githubusercontent.com/lystv/fmapp/ok/apk/pro/v.txt"
    }
    
    # APK下载链接
    APK_LINKS = {
        "OK版手机_32": "lystv/fmapp/main/apk/release/mobile-armeabi_v7a.apk",
        "OK版手机_64": "lystv/fmapp/main/apk/release/mobile-arm64_v8a.apk",
        "OK版电视_32": "lystv/fmapp/main/apk/release/leanback-armeabi_v7a.apk",
        "OK版电视_64": "lystv/fmapp/main/apk/release/leanback-arm64_v8a.apk",
        "OK海信专版_APK": "lystv/fmapp/main/apk/release/%E6%B5%B7%E4%BF%A1%E4%B8%93%E7%89%88.apk",
        "OK安卓4版本_APK": "lystv/fmapp/main/apk/kitkat/leanback.apk",
        "OK版Pro_手机Pro": "lystv/fmapp/ok/apk/pro/mobile-pro.apk",
        "OK版Pro_手机emu-Pro": "lystv/fmapp/ok/apk/pro/mobile-emu-pro.apk",
        "OK版Pro_电视Pro": "lystv/fmapp/ok/apk/pro/leanback-pro.apk",
        "蜜蜂版手机_32": "FongMi/Release/fongmi/apk/release/mobile-armeabi_v7a.apk",
        "蜜蜂版手机_64": "FongMi/Release/fongmi/apk/release/mobile-arm64_v8a.apk",
        "蜜蜂版电视_32": "FongMi/Release/fongmi/apk/release/leanback-armeabi_v7a.apk",
        "蜜蜂版电视_64": "FongMi/Release/fongmi/apk/release/leanback-arm64_v8a.apk",
    }
    
    # 版本与APK映射关系
    VERSION_TO_APKS = {
        "OK版Pro": ["OK版Pro_手机Pro", "OK版Pro_手机emu-Pro", "OK版Pro_电视Pro"],
        "OK版手机": ["OK版手机_32", "OK版手机_64", "OK海信专版_APK"],
        "OK版电视": ["OK版电视_32", "OK版电视_64"],
        "蜜蜂版手机": ["蜜蜂版手机_32", "蜜蜂版手机_64"],
        "蜜蜂版电视": ["蜜蜂版电视_32", "蜜蜂版电视_64"]
    }
    
    def __init__(self, log_callback, progress_callback):
        """初始化下载器
        
        Args:
            log_callback: 日志输出回调函数
            progress_callback: 进度更新回调函数
        """
        self.log = log_callback
        self.update_progress = progress_callback
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': self.USER_AGENT})
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)
        
        # 确保目录存在
        os.makedirs(self.VERSION_DIR, exist_ok=True)
        os.makedirs(self.DOWNLOAD_DIR, exist_ok=True)
    
    def check_json_update(self, name: str) -> Tuple[str, bool]:
        """检查指定版本是否有更新
        
        Args:
            name: 版本名称
            
        Returns:
            Tuple[str, bool]: (新版本号, 是否有更新)
        """
        url = self.URLS[name]
        old_json_file = os.path.join(self.VERSION_DIR, f"{name}.json")
        new_json_file_temp = os.path.join(self.VERSION_DIR, f"{name}临时.json")
        self.log(f"正在检查 {name} 的版本...")
        
        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            with open(new_json_file_temp, 'wb') as f:
                f.write(response.content)
            self.log(f"成功下载 {name} 的新版本信息.")
        except Exception as e:
            self.log(f"⚠️ 下载 {name} 版本信息失败，错误：{e}")
            self._safe_remove(new_json_file_temp)
            return "", False

        old_version = ""
        new_version = ""

        try:
            if name == "OK版Pro":
                # 处理Pro版本的特殊格式
                if os.path.exists(old_json_file):
                    with open(old_json_file, "r", encoding='utf-8') as f:
                        old_version = f.readline().strip()
                with open(new_json_file_temp, "r", encoding='utf-8') as f:
                    new_version = f.readline().strip()
            else:
                # 处理标准JSON格式
                if os.path.isfile(old_json_file):
                    with open(old_json_file, 'r', encoding='utf-8') as f:
                        old_json_data = json.load(f)
                        old_version = old_json_data.get("name", "")
                with open(new_json_file_temp, 'r', encoding='utf-8') as f:
                    new_json_data = json.load(f)
                    new_version = new_json_data.get("name", "")
        except Exception as e:
            self.log(f"⚠️ 解析版本信息失败: {e}")
            new_version = "" if not new_version else new_version
        finally:
            self._safe_remove(new_json_file_temp)

        self.log(f"{name} 旧版本号: {old_version if old_version else '未找到'}")
        self.log(f"{name} 新版本号: {new_version if new_version else '未找到'}")
        
        return new_version, (new_version and new_version != old_version)
    
    def update_local_version_file(self, name: str, new_version_content: str) -> bool:
        """更新本地版本信息文件
        
        Args:
            name: 版本名称
            new_version_content: 新版本内容
            
        Returns:
            bool: 是否成功更新
        """
        version_file_path = os.path.join(self.VERSION_DIR, f"{name}.json")
        try:
            with open(version_file_path, 'w', encoding='utf-8') as f:
                if name == "OK版Pro":
                    f.write(new_version_content)
                else:
                    json.dump({"name": new_version_content}, f, ensure_ascii=False, indent=2)
            self.log(f"本地 {name} 版本信息已更新为: {new_version_content}")
            return True
        except Exception as e:
            self.log(f"❌ 更新本地 {name} 版本文件失败: {e}")
            return False
    
    def download_apk(self, apk_name: str) -> bool:
        """下载指定的APK文件
        
        Args:
            apk_name: APK名称
            
        Returns:
            bool: 是否成功下载
        """
        self.update_progress(0)
        try:
            relative_path = self.APK_LINKS[apk_name]
            apk_url = f"https://raw.githubusercontent.com/{relative_path}"
        except KeyError:
            self.log(f"错误：在 APK_LINKS 中未找到名称为 '{apk_name}' 的条目，无法构建下载 URL。")
            self.update_progress(0)
            return False

        clean_apk_name = apk_name.replace("_APK", "")
        apk_path = os.path.join(self.DOWNLOAD_DIR, f"{clean_apk_name}.apk")
        self.log(f"📥 正在下载: {clean_apk_name}.apk")

        try:
            response = self.session.get(apk_url, stream=True, timeout=60)
            response.raise_for_status()
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(apk_path, 'wb') as f:
                for data in response.iter_content(chunk_size=8192):
                    f.write(data)
                    downloaded += len(data)
                    if total_size > 0:
                        progress = int((downloaded / total_size) * 100)
                        self.update_progress(progress)
            
            self.log(f"✅ 下载完成: {clean_apk_name}.apk")
            self.update_progress(100)
            return True
        except Exception as e:
            self.log(f"❌ APK 下载失败，错误：{e}")
            self.update_progress(0)
            self._safe_remove(apk_path)
            return False
    
    def download_version_apks(self, name: str, force_download: bool = False) -> bool:
        """下载指定版本的所有APK文件
        
        Args:
            name: 版本名称
            force_download: 是否强制下载
            
        Returns:
            bool: 是否成功下载
        """
        self.update_progress(0)
        self.log(f"\n--- 正在检查 {name} 是否有更新... ---")
        
        try:
            new_version_info, has_update = self.check_json_update(name)
            if not new_version_info:
                self.log(f"未能获取 {name} 的最新版本信息，跳过下载。")
                return False
                
            if force_download or has_update:
                action_text = "强制下载" if force_download else "检测到有更新"
                self.log(f"\n🧩 {name} {action_text}，准备下载相关 APKs...")
                
                # 获取需要下载的APK列表
                apks_to_download = self.VERSION_TO_APKS.get(name, [])
                if not apks_to_download:
                    self.log(f"⚠️ 警告: 未找到 {name} 对应的APK下载列表")
                    return False
                
                # 使用线程池并发下载APK
                futures = []
                for apk_name in apks_to_download:
                    if apk_name in self.APK_LINKS:
                        futures.append(self.executor.submit(self.download_apk, apk_name))
                    else:
                        self.log(f"⚠️ 警告: APK名称 '{apk_name}' 未在 APK_LINKS 字典中找到，跳过下载。")
                
                # 等待所有下载完成
                all_success = True
                for future in concurrent.futures.as_completed(futures):
                    if not future.result():
                        all_success = False
                
                # 更新本地版本信息
                if new_version_info:
                    self.update_local_version_file(name, new_version_info)
                
                self.log(f"--- {name} 下载任务完成 ---")
                self.update_progress(100)
                return all_success
            else:
                self.log(f"--- {name} 版本未变更，无需下载 ---")
                self.update_progress(100)
                return True
        except Exception as e:
            self.log(f"\n⚠️ {name} 任务异常终止: {e}")
            self.update_progress(0)
            return False
    
    def download_all_versions(self) -> bool:
        """下载所有有更新的版本
        
        Returns:
            bool: 是否全部成功
        """
        self.log("--- 开始检查所有版本更新 ---")
        self.update_progress(0)
        
        try:
            all_success = True
            total_versions = len(self.URLS)
            for i, name in enumerate(self.URLS.keys()):
                self.update_progress(int((i / total_versions) * 100))
                
                new_version_info, has_update = self.check_json_update(name)
                if not new_version_info:
                    self.log(f"未能获取 {name} 的最新版本信息，跳过下载。")
                    continue
                    
                if has_update:
                    if not self.download_version_apks(name):
                        all_success = False
                else:
                    self.log(f"--- {name} 版本未变更，无需下载 ---")
            
            self.log("\n--- 所有版本检查和更新完成 ---")
            self.update_progress(100)
            return all_success
        except Exception as e:
            self.log(f"\n⚠️ 更新过程中发生严重错误: {e}")
            self.update_progress(0)
            return False
    
    def download_kitkat_version(self) -> bool:
        """下载安卓4版本
        
        Returns:
            bool: 是否成功
        """
        try:
            self.log("--- 开始下载 OK 安卓4版本 ---")
            self.update_progress(0)
            result = self.download_apk("OK安卓4版本_APK")
            self.log("--- OK 安卓4版本下载完成 ---")
            return result
        except Exception as e:
            self.log(f"⚠️ 下载 OK 安卓4版本任务异常终止: {e}")
            self.update_progress(0)
            return False
    
    def _safe_remove(self, file_path: str) -> None:
        """安全删除文件
        
        Args:
            file_path: 文件路径
        """
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                self.log(f"⚠️ 删除文件失败: {file_path} - {e}")


class APKDownloaderGUI:
    """APK下载器图形界面类"""
    
    def __init__(self):
        """初始化GUI"""
        # 使用 'superhero' 主题，这是一个现代深色主题
        self.root = tb.Window(themename="superhero")
        self.root.title("APK 更新下载工具")
        self.root.geometry("900x750")  # 稍微增大窗口尺寸
        self.root.resizable(True, True)
        
        # 创建下载器实例
        self.downloader = APKDownloader(
            log_callback=self.append_log_safe,
            progress_callback=self.update_progress_safe
        )
        
        # 创建界面元素
        self._create_widgets()
        
        # 初始消息
        self.append_log_safe("欢迎使用 APK 更新下载工具！请点击按钮开始操作。")
    
    def _create_widgets(self):
        """创建界面元素"""
        # 主框架，增加整体内外边距
        self.main_frame = ttk.Frame(self.root, padding=(30, 20))  # 左右30，上下20
        self.main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        
        # 确保所有列都能均匀拉伸
        for i in range(4):
            self.main_frame.columnconfigure(i, weight=1)
        self.main_frame.rowconfigure(4, weight=1)  # 让日志文本框所在的行可伸缩
        
        # --- 按钮布局 ---
        # 顶部主控制按钮 (第一行)
        self.start_button = ttk.Button(
            self.main_frame, 
            text="检查并更新所有版本", 
            bootstyle="primary",
            command=self._run_all_updates
        )
        
        self.open_dir_button = ttk.Button(
            self.main_frame, 
            text="打开下载目录", 
            bootstyle="info",
            command=self._open_download_directory
        )
        
        self.kitkat_button = ttk.Button(
            self.main_frame, 
            text="下载 OK安卓4版本", 
            bootstyle="warning",
            command=self._run_kitkat_download
        )
        
        self.start_button.grid(row=0, column=0, columnspan=2, padx=(0, 10), pady=15, sticky=(tk.W, tk.E))
        self.open_dir_button.grid(row=0, column=2, padx=(10, 5), pady=15, sticky=(tk.W, tk.E))
        self.kitkat_button.grid(row=0, column=3, padx=(5, 0), pady=15, sticky=(tk.W, tk.E))
        
        # 各版本独立下载按钮 (第二、三行)
        button_opts = {'padx': 5, 'pady': 10, 'sticky': (tk.W, tk.E)}  # 定义通用按钮选项
        
        self.ok_mobile_button = ttk.Button(
            self.main_frame, 
            text="下载 OK版手机 (如有更新)", 
            bootstyle="success",
            command=lambda: self._run_version_download("OK版手机")
        )
        
        self.ok_tv_button = ttk.Button(
            self.main_frame, 
            text="下载 OK版电视 (如有更新)", 
            bootstyle="success",
            command=lambda: self._run_version_download("OK版电视")
        )
        
        self.ok_pro_button = ttk.Button(
            self.main_frame, 
            text="下载 OK版Pro (如有更新)", 
            bootstyle="success",
            command=lambda: self._run_version_download("OK版Pro")
        )
        
        self.ok_mobile_button.grid(row=1, column=0, **button_opts)
        self.ok_tv_button.grid(row=1, column=1, **button_opts)
        self.ok_pro_button.grid(row=1, column=2, **button_opts)
        
        self.mf_mobile_button = ttk.Button(
            self.main_frame, 
            text="下载 蜜蜂版手机 (如有更新)", 
            bootstyle="info",
            command=lambda: self._run_version_download("蜜蜂版手机")
        )
        
        self.mf_tv_button = ttk.Button(
            self.main_frame, 
            text="下载 蜜蜂版电视 (如有更新)", 
            bootstyle="info",
            command=lambda: self._run_version_download("蜜蜂版电视")
        )
        
        self.mf_mobile_button.grid(row=2, column=0, **button_opts)
        self.mf_tv_button.grid(row=2, column=1, **button_opts)
        
        # 日志标签和文本框
        self.log_label = ttk.Label(
            self.main_frame, 
            text="日志输出:", 
            bootstyle="secondary", 
            font=('微软雅黑', 12, 'bold')
        )
        self.log_label.grid(row=3, column=0, sticky=tk.W, pady=(20, 5))  # 增加上内边距
        
        self.log_text = tk.Text(
            self.main_frame, 
            height=18, 
            width=70, 
            wrap=tk.WORD,
            bg="#2a2a2a", 
            fg="#e0e0e0", 
            relief=tk.FLAT,  # 调整字体颜色，更柔和
            font=('Consolas', 11)  # 稍微增大字体
        )
        
        self.log_scrollbar = ttk.Scrollbar(
            self.main_frame, 
            command=self.log_text.yview, 
            bootstyle="round"
        )
        
        self.log_scrollbar.grid(row=4, column=4, sticky=(tk.N, tk.S))
        self.log_text['yscrollcommand'] = self.log_scrollbar.set
        self.log_text.grid(row=4, column=0, columnspan=4, padx=5, pady=5, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # 进度标签和进度条
        self.progress_label = ttk.Label(
            self.main_frame, 
            text="当前任务进度:", 
            bootstyle="secondary", 
            font=('微软雅黑', 12, 'bold')
        )
        self.progress_label.grid(row=5, column=0, sticky=tk.W, pady=(20, 5))  # 增加上内边距
        
        self.progress_bar = ttk.Progressbar(
            self.main_frame, 
            orient="horizontal", 
            mode="determinate", 
            bootstyle="striped.success",
            length=700  # 明确指定长度，让它看起来更宽
        )
        self.progress_bar.grid(row=6, column=0, columnspan=4, padx=5, pady=10, sticky=(tk.W, tk.E))
    
    # --- GUI 更新函数 ---
    def append_log_safe(self, message: str) -> None:
        """线程安全的日志追加
        
        Args:
            message: 日志消息
        """
        self.root.after(0, self._append_log_gui, message)
    
    def _append_log_gui(self, message: str) -> None:
        """在GUI线程中追加日志
        
        Args:
            message: 日志消息
        """
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.yview(tk.END)
    
    def update_progress_safe(self, value: int) -> None:
        """线程安全的进度更新
        
        Args:
            value: 进度值(0-100)
        """
        self.root.after(0, self._update_progress_gui, value)
    
    def _update_progress_gui(self, value: int) -> None:
        """在GUI线程中更新进度条
        
        Args:
            value: 进度值(0-100)
        """
        self.progress_bar['value'] = value
    
    def set_all_buttons_state(self, state: str) -> None:
        """设置所有按钮状态
        
        Args:
            state: 按钮状态(tk.NORMAL或tk.DISABLED)
        """
        self.root.after(0, self._set_all_buttons_gui, state)
    
    def _set_all_buttons_gui(self, state: str) -> None:
        """在GUI线程中设置所有按钮状态
        
        Args:
            state: 按钮状态
        """
        buttons = [
            self.start_button, 
            self.open_dir_button, 
            self.kitkat_button,
            self.ok_mobile_button, 
            self.ok_tv_button, 
            self.ok_pro_button,
            self.mf_mobile_button, 
            self.mf_tv_button
        ]
        
        for button in buttons:
            if button.winfo_exists():
                button.config(state=state)
    
    # --- 功能函数 ---
    def _open_download_directory(self) -> None:
        """打开下载目录"""
        target_dir = os.path.realpath(self.downloader.DOWNLOAD_DIR)
        self.append_log_safe(f"尝试打开目录: {target_dir}")
        
        try:
            if sys.platform == "win32":
                os.startfile(target_dir)
            elif sys.platform == "darwin":
                subprocess.run(['open', target_dir], check=True)
            elif sys.platform.startswith('linux'):
                subprocess.run(['xdg-open', target_dir], check=True)
            else:
                self.append_log_safe(f"⚠️ 警告: 不支持的操作系统 '{sys.platform}'，无法自动打开目录。")
                return
            self.append_log_safe("成功打开下载目录。")
        except Exception as e:
            self.append_log_safe(f"❌ 打开目录时发生错误: {e}")
    
    def _run_version_download(self, name: str, force: bool = False) -> None:
        """运行版本下载任务
        
        Args:
            name: 版本名称
            force: 是否强制下载
        """
        self.set_all_buttons_state(tk.DISABLED)
        
        def task():
            try:
                self.downloader.download_version_apks(name, force)
            finally:
                self.set_all_buttons_state(tk.NORMAL)
        
        threading.Thread(target=task, daemon=True).start()
    
    def _run_all_updates(self) -> None:
        """运行所有更新任务"""
        self.set_all_buttons_state(tk.DISABLED)
        
        def task():
            try:
                self.downloader.download_all_versions()
            finally:
                self.set_all_buttons_state(tk.NORMAL)
        
        threading.Thread(target=task, daemon=True).start()
    
    def _run_kitkat_download(self) -> None:
        """运行安卓4版本下载任务"""
        self.set_all_buttons_state(tk.DISABLED)
        
        def task():
            try:
                self.downloader.download_kitkat_version()
            finally:
                self.set_all_buttons_state(tk.NORMAL)
        
        threading.Thread(target=task, daemon=True).start()
    
    def run(self) -> None:
        """运行GUI主循环"""
        self.root.mainloop()


# 程序入口点
if __name__ == "__main__":
    app = APKDownloaderGUI()
    app.run()