/* tslint:disable */
/* eslint-disable */

export enum AudioCodec {
    Aac = 0,
    Mp3 = 1,
    Opus = 2,
    Pcm = 3,
    Copy = 4,
    /**
     * 不包含音频轨道
     */
    None = 5,
}

/**
 * 分片传输管理器
 * 将大文件切分成小块传递给 JS，避免一次性分配大量内存
 */
export class ChunkTransfer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 获取当前分片的元信息 JSON
     */
    current_chunk_info(): string;
    /**
     * 文件总大小
     */
    file_size(): number;
    /**
     * 是否还有下一块
     */
    has_next(): boolean;
    constructor(data: Uint8Array, chunk_size: number, file_name: string);
    /**
     * 获取下一块数据（Uint8Array，零拷贝视图）
     */
    next_chunk(): Uint8Array;
    /**
     * 重置到第一块
     */
    reset(): void;
    /**
     * 总分片数
     */
    total_chunks(): number;
}

export enum Container {
    Mp4 = 0,
    WebM = 1,
    Mkv = 2,
    Mp3 = 3,
    Wav = 4,
    Gif = 5,
}

/**
 * FFmpeg 任务执行器
 * 管理一次完整的 FFmpeg 操作的生命周期
 */
export class FfmpegTask {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 添加需要写入虚拟文件系统的输入文件
     */
    add_input_file(name: string, data: Uint8Array): void;
    /**
     * 取消任务
     */
    cancel(): void;
    files_written(): number;
    get_error(): string | undefined;
    /**
     * 获取指定索引的输入文件数据（用于 Transferable 传输）
     */
    get_input_file_data(index: number): Uint8Array | undefined;
    /**
     * 处理从 Worker 收到的消息，推进状态机
     */
    handle_message(message_json: string): void;
    has_error(): boolean;
    constructor(task_id: string, total_duration_sec: number);
    /**
     * 获取下一步要发给 JS Worker 的消息（JSON）
     * 返回 None 表示等待 Worker 回包
     */
    next_message(): string | undefined;
    /**
     * 获取当前进度 JSON
     */
    progress_json(): string;
    /**
     * 设置 FFmpeg 参数（JSON 数组字符串）
     */
    set_args_json(args_json: string): void;
    /**
     * 设置输出文件名
     */
    set_output_file(name: string): void;
    total_input_files(): number;
    readonly output_file_name: string;
    readonly state: TaskState;
    readonly task_id: string;
}

/**
 * 待处理文件队列
 */
export class FileQueue {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 清空队列
     */
    clear(): void;
    /**
     * 是否为空
     */
    is_empty(): boolean;
    /**
     * 队列长度
     */
    len(): number;
    constructor();
    /**
     * 查看当前文件元信息（不弹出）
     */
    peek_info(): string | undefined;
    /**
     * 弹出当前文件的数据
     */
    pop_data(): Uint8Array | undefined;
    /**
     * 添加文件到队列
     */
    push(name: string, data: Uint8Array, mime_type: string): void;
    /**
     * 剩余未处理数量
     */
    remaining(): number;
    /**
     * 重置游标
     */
    reset_cursor(): void;
}

export class MediaInfoParser {
    free(): void;
    [Symbol.dispose](): void;
    clear(): void;
    /**
     * 追加 FFmpeg 日志行
     */
    feed(line: string): void;
    constructor();
    /**
     * 解析已收集的日志，提取媒体信息
     *
     * FFmpeg ffprobe/stderr 输出格式（简化）：
     * `  Duration: 00:01:23.45, start: 0.000000, bitrate: 2048 kb/s`
     * `    Stream #0:0: Video: h264, yuv420p, 1920x1080, 29.97 fps`
     * `    Stream #0:1: Audio: aac, 44100 Hz, stereo`
     */
    parse(): MediaInfoWrapper;
}

export class MediaInfoWrapper {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    to_json(): string;
    readonly audio_channels: number;
    readonly audio_codec: string;
    readonly audio_sample_rate: number;
    readonly bitrate_kbps: bigint;
    readonly duration_sec: number;
    readonly file_size_bytes: bigint;
    readonly fps: number;
    readonly height: number;
    readonly video_codec: string;
    readonly width: number;
}

export class ProgressInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 当前输出码率（kbps）
     */
    bitrate_kbps: number;
    /**
     * 当前处理速度（fps）
     */
    fps: number;
    /**
     * 已处理的视频帧数
     */
    frame: bigint;
    /**
     * 完成百分比（需要知道总时长才能计算）
     */
    get percent(): number | undefined;
    /**
     * 完成百分比（需要知道总时长才能计算）
     */
    set percent(value: number | null | undefined);
    /**
     * 输出文件大小（KB）
     */
    size_kb: number;
    /**
     * 处理速度比（2.0x 表示比实时快 2 倍）
     */
    speed: number;
    /**
     * 已处理时间（秒）
     */
    time_sec: number;
}

export class ProgressParser {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 获取最近一次解析的进度
     */
    last_progress_json(): string;
    constructor(total_duration_sec: number);
    /**
     * 解析一行 FFmpeg 日志，返回进度 JSON（如果该行含进度信息）
     *
     * FFmpeg 进度行格式示例：
     * `frame=  120 fps= 60 q=28.0 size=    512kB time=00:00:04.00 bitrate=1048.6kbits/s speed=2.00x`
     */
    parse_line(line: string): string | undefined;
    /**
     * 更新总时长（当从视频元数据获取后调用）
     */
    set_total_duration(sec: number): void;
}

/**
 * 在 WASM 线性内存中分配缓冲区，暴露指针给 JS 直接写入
 * 避免 JS→WASM 的数据拷贝
 */
export class SharedBuffer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 填充为 0
     */
    clear(): void;
    /**
     * 获取数据副本（不消耗 self）
     */
    get_data(): Uint8Array;
    /**
     * 是否为空
     */
    is_empty(): boolean;
    /**
     * 缓冲区长度
     */
    len(): number;
    /**
     * 分配指定大小的缓冲区
     */
    constructor(size: number);
    /**
     * 返回缓冲区在 WASM 线性内存中的指针
     * JS 可通过 `new Uint8Array(wasm.memory.buffer, ptr, len)` 直接访问
     */
    ptr(): number;
    /**
     * 从指定偏移读取数据
     */
    read_at(offset: number, length: number): Uint8Array;
    /**
     * 调整缓冲区大小（保留已有数据）
     */
    resize(new_size: number): void;
    /**
     * 从 JS 写入数据后，取出内部 Vec（消耗 self）
     * 使用场景：JS 通过指针填充数据后，Rust 取出处理
     */
    take_data(): Uint8Array;
}

export enum TaskState {
    Idle = 0,
    Initializing = 1,
    WritingFiles = 2,
    Executing = 3,
    ReadingOutput = 4,
    Cleanup = 5,
    Done = 6,
    Failed = 7,
    Cancelled = 8,
}

export enum VideoCodec {
    /**
     * H.264，兼容性最佳
     */
    H264 = 0,
    /**
     * H.265，压缩率更高
     */
    H265 = 1,
    /**
     * VP9，WebM 容器
     */
    Vp9 = 2,
    /**
     * 流复制（不重新编码，速度极快）
     */
    Copy = 3,
}

/**
 * 计算数据的 Adler-32 校验和（轻量，适合 WASM）
 */
export function adler32(data: Uint8Array): number;

/**
 * 构建「多片段合并」命令（concat demuxer 方式）
 */
export function build_concat_command(concat_list_name: string, output_name: string, width: number, height: number, fps: number, video_bitrate_kbps: number, audio_bitrate_kbps: number): string;

/**
 * 构建「提取音频」命令
 */
export function build_extract_audio_command(input_name: string, output_name: string, format_str: string, bitrate_kbps: number): string;

/**
 * 构建「生成缩略图」命令
 */
export function build_thumbnail_command(input_name: string, output_name: string, time_sec: number, width: number, height: number): string;

/**
 * 构建「格式转换」命令
 */
export function build_transcode_command(input_name: string, output_name: string, container_str: string, video_bitrate_kbps: number, audio_bitrate_kbps: number, width: number, height: number, fps: number): string;

/**
 * 构建「单文件裁剪」命令
 */
export function build_trim_command(input_name: string, output_name: string, start_sec: number, duration_sec: number, use_stream_copy: boolean): string;

/**
 * 构建「生成波形图数据」命令（提取 PCM 用于 JS 绘制）
 */
export function build_waveform_command(input_name: string, output_name: string, sample_rate: number): string;

/**
 * 简单的文件魔数检测，判断文件类型
 */
export function detect_mime_type(data: Uint8Array): string;

/**
 * 生成 FFmpeg concat demuxer 所需的文件列表内容
 * 格式：
 * ```
 * file 'segment_0.mp4'
 * file 'segment_1.mp4'
 * ```
 */
export function generate_concat_list(file_names_json: string): string;

/**
 * 生成带时间偏移的 concat 列表（用于精确拼接）
 */
export function generate_concat_list_with_offsets(segments_json: string): string;

export function init(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_chunktransfer_free: (a: number, b: number) => void;
    readonly __wbg_filequeue_free: (a: number, b: number) => void;
    readonly __wbg_sharedbuffer_free: (a: number, b: number) => void;
    readonly adler32: (a: number, b: number) => number;
    readonly chunktransfer_current_chunk_info: (a: number) => [number, number];
    readonly chunktransfer_file_size: (a: number) => number;
    readonly chunktransfer_has_next: (a: number) => number;
    readonly chunktransfer_new: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly chunktransfer_next_chunk: (a: number) => [number, number, number];
    readonly chunktransfer_reset: (a: number) => void;
    readonly chunktransfer_total_chunks: (a: number) => number;
    readonly detect_mime_type: (a: number, b: number) => [number, number];
    readonly filequeue_clear: (a: number) => void;
    readonly filequeue_is_empty: (a: number) => number;
    readonly filequeue_len: (a: number) => number;
    readonly filequeue_new: () => number;
    readonly filequeue_peek_info: (a: number) => [number, number];
    readonly filequeue_pop_data: (a: number) => [number, number];
    readonly filequeue_push: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly filequeue_remaining: (a: number) => number;
    readonly filequeue_reset_cursor: (a: number) => void;
    readonly sharedbuffer_clear: (a: number) => void;
    readonly sharedbuffer_get_data: (a: number) => [number, number];
    readonly sharedbuffer_is_empty: (a: number) => number;
    readonly sharedbuffer_len: (a: number) => number;
    readonly sharedbuffer_new: (a: number) => number;
    readonly sharedbuffer_ptr: (a: number) => number;
    readonly sharedbuffer_read_at: (a: number, b: number, c: number) => [number, number, number, number];
    readonly sharedbuffer_resize: (a: number, b: number) => void;
    readonly sharedbuffer_take_data: (a: number) => [number, number];
    readonly __wbg_ffmpegtask_free: (a: number, b: number) => void;
    readonly ffmpegtask_add_input_file: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly ffmpegtask_cancel: (a: number) => void;
    readonly ffmpegtask_files_written: (a: number) => number;
    readonly ffmpegtask_get_error: (a: number) => [number, number];
    readonly ffmpegtask_get_input_file_data: (a: number, b: number) => [number, number];
    readonly ffmpegtask_handle_message: (a: number, b: number, c: number) => [number, number];
    readonly ffmpegtask_has_error: (a: number) => number;
    readonly ffmpegtask_new: (a: number, b: number, c: number) => number;
    readonly ffmpegtask_next_message: (a: number) => [number, number];
    readonly ffmpegtask_output_file_name: (a: number) => [number, number];
    readonly ffmpegtask_progress_json: (a: number) => [number, number];
    readonly ffmpegtask_set_args_json: (a: number, b: number, c: number) => [number, number];
    readonly ffmpegtask_set_output_file: (a: number, b: number, c: number) => void;
    readonly ffmpegtask_state: (a: number) => number;
    readonly ffmpegtask_task_id: (a: number) => [number, number];
    readonly ffmpegtask_total_input_files: (a: number) => number;
    readonly generate_concat_list: (a: number, b: number) => [number, number, number, number];
    readonly generate_concat_list_with_offsets: (a: number, b: number) => [number, number, number, number];
    readonly __wbg_get_progressinfo_bitrate_kbps: (a: number) => number;
    readonly __wbg_get_progressinfo_fps: (a: number) => number;
    readonly __wbg_get_progressinfo_frame: (a: number) => bigint;
    readonly __wbg_get_progressinfo_percent: (a: number) => [number, number];
    readonly __wbg_get_progressinfo_size_kb: (a: number) => number;
    readonly __wbg_get_progressinfo_speed: (a: number) => number;
    readonly __wbg_get_progressinfo_time_sec: (a: number) => number;
    readonly __wbg_mediainfoparser_free: (a: number, b: number) => void;
    readonly __wbg_mediainfowrapper_free: (a: number, b: number) => void;
    readonly __wbg_progressinfo_free: (a: number, b: number) => void;
    readonly __wbg_progressparser_free: (a: number, b: number) => void;
    readonly __wbg_set_progressinfo_bitrate_kbps: (a: number, b: number) => void;
    readonly __wbg_set_progressinfo_fps: (a: number, b: number) => void;
    readonly __wbg_set_progressinfo_frame: (a: number, b: bigint) => void;
    readonly __wbg_set_progressinfo_percent: (a: number, b: number, c: number) => void;
    readonly __wbg_set_progressinfo_size_kb: (a: number, b: number) => void;
    readonly __wbg_set_progressinfo_speed: (a: number, b: number) => void;
    readonly __wbg_set_progressinfo_time_sec: (a: number, b: number) => void;
    readonly mediainfoparser_clear: (a: number) => void;
    readonly mediainfoparser_feed: (a: number, b: number, c: number) => void;
    readonly mediainfoparser_new: () => number;
    readonly mediainfoparser_parse: (a: number) => number;
    readonly mediainfowrapper_audio_channels: (a: number) => number;
    readonly mediainfowrapper_audio_codec: (a: number) => [number, number];
    readonly mediainfowrapper_audio_sample_rate: (a: number) => number;
    readonly mediainfowrapper_bitrate_kbps: (a: number) => bigint;
    readonly mediainfowrapper_duration_sec: (a: number) => number;
    readonly mediainfowrapper_file_size_bytes: (a: number) => bigint;
    readonly mediainfowrapper_fps: (a: number) => number;
    readonly mediainfowrapper_height: (a: number) => number;
    readonly mediainfowrapper_to_json: (a: number) => [number, number];
    readonly mediainfowrapper_video_codec: (a: number) => [number, number];
    readonly mediainfowrapper_width: (a: number) => number;
    readonly progressparser_last_progress_json: (a: number) => [number, number];
    readonly progressparser_new: (a: number) => number;
    readonly progressparser_parse_line: (a: number, b: number, c: number) => [number, number];
    readonly progressparser_set_total_duration: (a: number, b: number) => void;
    readonly init: () => void;
    readonly build_concat_command: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly build_extract_audio_command: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly build_thumbnail_command: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly build_transcode_command: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number, number];
    readonly build_trim_command: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly build_waveform_command: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
