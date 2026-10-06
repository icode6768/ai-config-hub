"""DongChuangAI audio suite.

Covers the same audio channels used by DesktopAIHome / AIAudio:
fish TTS, doubao (volcengine) TTS, fish ASR, fish voice-change,
voice clone (/audio/process), extract audio from video, voice catalogs
and audio history polling.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests


BASE_URL = os.environ.get('DONGCHUANGAI_BASE_URL', 'http://127.0.0.1:5000/api/v1').rstrip('/')

TERMINAL_STATUS = {'done', 'failed', 'success', 'error'}


def api_key() -> str:
    key = os.environ.get('DONGCHUANGAI_API_KEY', '').strip()
    if not key:
        raise SystemExit('Missing DONGCHUANGAI_API_KEY')
    return key


def headers() -> dict:
    return {'Authorization': f'Bearer {api_key()}'}


def request_json(method: str, path: str, **kwargs):
    response = requests.request(method, f'{BASE_URL}{path}', headers=headers(), timeout=300, **kwargs)
    response.raise_for_status()
    return response.json()


def open_file(file_path: str):
    path = Path(file_path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise SystemExit(f'File not found: {file_path}')
    return path


def save_output(data, output: str | None):
    if not output:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return
    Path(output).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'OUTPUT_FILE:{output}')


def fish_tts(text: str, reference_id: str | None, model: str | None, tool_slug: str | None, tool_title: str | None):
    payload = {'text': text}
    if reference_id:
        payload['reference_id'] = reference_id
    if model:
        payload['model'] = model
    if tool_slug:
        payload['tool_slug'] = tool_slug
    if tool_title:
        payload['tool_title'] = tool_title
    return request_json('POST', '/audio/fish/tts', json=payload)


def doubao_tts(text: str, voice: str | None, speed: float | None, emotion: str | None, fmt: str | None, tool_slug: str | None, tool_title: str | None):
    payload = {'text': text}
    if voice:
        payload['voice'] = voice
    if speed is not None:
        payload['speed'] = speed
    if emotion:
        payload['emotion'] = emotion
    if fmt:
        payload['format'] = fmt
    if tool_slug:
        payload['tool_slug'] = tool_slug
    if tool_title:
        payload['tool_title'] = tool_title
    return request_json('POST', '/audio/doubao/tts', json=payload)


def doubao_voices(gender: str | None):
    params = {}
    if gender:
        params['gender'] = gender
    return request_json('GET', '/audio/doubao/voices', params=params)


def fish_models(title: str | None, language: str | None, page: int, page_size: int, self_only: bool):
    params = {'page_number': page, 'page_size': page_size}
    if title:
        params['title'] = title
    if language:
        params['language'] = language
    if self_only:
        params['self_only'] = 'true'
    return request_json('GET', '/audio/fish/models', params=params)


def fish_asr(audio_path: str, language: str | None):
    path = open_file(audio_path)
    data = {}
    if language:
        data['language'] = language
    with path.open('rb') as fh:
        return request_json('POST', '/audio/fish/asr', files={'audio': (path.name, fh)}, data=data)


def fish_voice_change(source_path: str, target_path: str | None, reference_id: str | None, language: str | None):
    source = open_file(source_path)
    data = {}
    if reference_id:
        data['reference_id'] = reference_id
    if language:
        data['language'] = language
    with source.open('rb') as src_fh:
        files = {'source_audio': (source.name, src_fh)}
        if target_path:
            target = open_file(target_path)
            with target.open('rb') as tgt_fh:
                files['target_audio'] = (target.name, tgt_fh)
                return request_json('POST', '/audio/fish/voice-change', files=files, data=data)
        return request_json('POST', '/audio/fish/voice-change', files=files, data=data)


def clone_process(prompt: str, audio_path: str):
    path = open_file(audio_path)
    with path.open('rb') as fh:
        return request_json('POST', '/audio/process', files={'audio': (path.name, fh)}, data={'prompt': prompt})


def extract_audio(video_path: str):
    path = open_file(video_path)
    with path.open('rb') as fh:
        return request_json('POST', '/audio/extract-audio', files={'video': (path.name, fh)})


def history_list(page: int, per_page: int):
    return request_json('GET', '/audio/history', params={'page': page, 'per_page': per_page})


def history_refresh(history_id: int):
    return request_json('POST', f'/audio/history/{history_id}/refresh')


def wait_history(history_id: int, timeout: int, interval: int = 8):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = history_refresh(history_id)
        item = last.get('data') if isinstance(last, dict) else None
        status = str((item or {}).get('status') or '').lower()
        if status in TERMINAL_STATUS:
            return last
        print(f'WAITING audio history_id={history_id} status={status or "unknown"}', file=sys.stderr)
        time.sleep(interval)
    return last


def maybe_wait(result, wait: bool, timeout: int):
    if not wait or not isinstance(result, dict):
        return result
    item = result.get('data') or {}
    status = str(item.get('status') or '').lower()
    history_id = item.get('id') or item.get('history_id')
    if history_id and status and status not in TERMINAL_STATUS:
        return wait_history(int(history_id), timeout)
    return result


def main():
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--tts', action='store_true', help='Fish TTS: text to speech.')
    action.add_argument('--doubao-tts', action='store_true', help='Doubao (volcengine) TTS.')
    action.add_argument('--doubao-voices', action='store_true', help='List doubao voice catalog.')
    action.add_argument('--voices', action='store_true', help='List fish voice models.')
    action.add_argument('--asr', action='store_true', help='Speech to text.')
    action.add_argument('--voice-change', action='store_true', help='Voice conversion.')
    action.add_argument('--clone', action='store_true', help='Voice clone via /audio/process (prompt + audio).')
    action.add_argument('--extract', action='store_true', help='Extract audio track from a video file.')
    action.add_argument('--history', action='store_true', help='List audio history.')
    action.add_argument('--refresh-history', type=int, help='Refresh one audio history record.')

    parser.add_argument('--text', help='Input text for TTS.')
    parser.add_argument('--prompt', help='Prompt for --clone.')
    parser.add_argument('--audio', help='Audio file path (asr/clone/voice-change source).')
    parser.add_argument('--target-audio', help='Voice-change target audio file path.')
    parser.add_argument('--video', help='Video file path for --extract.')
    parser.add_argument('--reference-id', help='Fish voice reference id.')
    parser.add_argument('--model', help='Fish TTS model override.')
    parser.add_argument('--voice', help='Doubao voice_type/name.')
    parser.add_argument('--speed', type=float, help='Doubao speech speed.')
    parser.add_argument('--emotion', help='Doubao emotion.')
    parser.add_argument('--format', dest='fmt', help='Doubao output format, e.g. mp3.')
    parser.add_argument('--gender', choices=['male', 'female'], help='Doubao voices filter.')
    parser.add_argument('--language', help='Language hint for asr/voice-change, or fish voices filter.')
    parser.add_argument('--title', help='Fish voices title filter.')
    parser.add_argument('--self-only', action='store_true', help='Fish voices: only my own models.')
    parser.add_argument('--tool-slug', help='History attribution tool_slug.')
    parser.add_argument('--tool-title', help='History attribution tool_title.')
    parser.add_argument('--page', type=int, default=1)
    parser.add_argument('--per-page', type=int, default=20)
    parser.add_argument('--wait', action='store_true', help='Poll audio history until terminal status.')
    parser.add_argument('--timeout', type=int, default=900)
    parser.add_argument('-o', '--output')
    args = parser.parse_args()

    if args.tts:
        if not args.text:
            raise SystemExit('Missing --text')
        result = fish_tts(args.text, args.reference_id, args.model, args.tool_slug, args.tool_title)
    elif args.doubao_tts:
        if not args.text:
            raise SystemExit('Missing --text')
        result = doubao_tts(args.text, args.voice, args.speed, args.emotion, args.fmt, args.tool_slug, args.tool_title)
    elif args.doubao_voices:
        result = doubao_voices(args.gender)
    elif args.voices:
        result = fish_models(args.title, args.language, args.page, args.per_page, args.self_only)
    elif args.asr:
        if not args.audio:
            raise SystemExit('Missing --audio')
        result = fish_asr(args.audio, args.language)
    elif args.voice_change:
        if not args.audio:
            raise SystemExit('Missing --audio (source audio)')
        if not args.target_audio and not args.reference_id:
            raise SystemExit('Provide --target-audio or --reference-id')
        result = fish_voice_change(args.audio, args.target_audio, args.reference_id, args.language)
    elif args.clone:
        if not args.prompt or not args.audio:
            raise SystemExit('Missing --prompt or --audio')
        result = clone_process(args.prompt, args.audio)
    elif args.extract:
        if not args.video:
            raise SystemExit('Missing --video')
        result = extract_audio(args.video)
    elif args.history:
        result = history_list(args.page, args.per_page)
    elif args.refresh_history:
        result = history_refresh(args.refresh_history)
    else:  # pragma: no cover - argparse enforces the group
        raise SystemExit('No action')

    result = maybe_wait(result, args.wait, args.timeout)
    save_output(result, args.output)


if __name__ == '__main__':
    main()
