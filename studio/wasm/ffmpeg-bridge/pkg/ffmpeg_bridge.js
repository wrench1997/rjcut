/* @ts-self-types="./ffmpeg_bridge.d.ts" */

//#region exports

/**
 * @enum {0 | 1 | 2 | 3 | 4 | 5}
 */
export const AudioCodec = Object.freeze({
    Aac: 0, "0": "Aac",
    Mp3: 1, "1": "Mp3",
    Opus: 2, "2": "Opus",
    Pcm: 3, "3": "Pcm",
    Copy: 4, "4": "Copy",
    /**
     * 不包含音频轨道
     */
    None: 5, "5": "None",
});

/**
 * 分片传输管理器
 * 将大文件切分成小块传递给 JS，避免一次性分配大量内存
 */
export class ChunkTransfer {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ChunkTransferFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_chunktransfer_free(ptr, 0);
    }
    /**
     * 获取当前分片的元信息 JSON
     * @returns {string}
     */
    current_chunk_info() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.chunktransfer_current_chunk_info(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * 文件总大小
     * @returns {number}
     */
    file_size() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.chunktransfer_file_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * 是否还有下一块
     * @returns {boolean}
     */
    has_next() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.chunktransfer_has_next(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {Uint8Array} data
     * @param {number} chunk_size
     * @param {string} file_name
     */
    constructor(data, chunk_size, file_name) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        _assertNum(chunk_size);
        const ptr1 = passStringToWasm0(file_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.chunktransfer_new(ptr0, len0, chunk_size, ptr1, len1);
        this.__wbg_ptr = ret;
        ChunkTransferFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 获取下一块数据（Uint8Array，零拷贝视图）
     * @returns {Uint8Array}
     */
    next_chunk() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.chunktransfer_next_chunk(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * 重置到第一块
     */
    reset() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.chunktransfer_reset(this.__wbg_ptr);
    }
    /**
     * 总分片数
     * @returns {number}
     */
    total_chunks() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.chunktransfer_total_chunks(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) ChunkTransfer.prototype[Symbol.dispose] = ChunkTransfer.prototype.free;

/**
 * @enum {0 | 1 | 2 | 3 | 4 | 5}
 */
export const Container = Object.freeze({
    Mp4: 0, "0": "Mp4",
    WebM: 1, "1": "WebM",
    Mkv: 2, "2": "Mkv",
    Mp3: 3, "3": "Mp3",
    Wav: 4, "4": "Wav",
    Gif: 5, "5": "Gif",
});

/**
 * FFmpeg 任务执行器
 * 管理一次完整的 FFmpeg 操作的生命周期
 */
export class FfmpegTask {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FfmpegTaskFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ffmpegtask_free(ptr, 0);
    }
    /**
     * 添加需要写入虚拟文件系统的输入文件
     * @param {string} name
     * @param {Uint8Array} data
     */
    add_input_file(name, data) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.ffmpegtask_add_input_file(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * 取消任务
     */
    cancel() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.ffmpegtask_cancel(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    files_written() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.ffmpegtask_files_written(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string | undefined}
     */
    get_error() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.ffmpegtask_get_error(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * 获取指定索引的输入文件数据（用于 Transferable 传输）
     * @param {number} index
     * @returns {Uint8Array | undefined}
     */
    get_input_file_data(index) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(index);
        const ret = wasm.ffmpegtask_get_input_file_data(this.__wbg_ptr, index);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * 处理从 Worker 收到的消息，推进状态机
     * @param {string} message_json
     */
    handle_message(message_json) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(message_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ffmpegtask_handle_message(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {boolean}
     */
    has_error() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.ffmpegtask_has_error(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} task_id
     * @param {number} total_duration_sec
     */
    constructor(task_id, total_duration_sec) {
        const ptr0 = passStringToWasm0(task_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ffmpegtask_new(ptr0, len0, total_duration_sec);
        this.__wbg_ptr = ret;
        FfmpegTaskFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 获取下一步要发给 JS Worker 的消息（JSON）
     * 返回 None 表示等待 Worker 回包
     * @returns {string | undefined}
     */
    next_message() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.ffmpegtask_next_message(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {string}
     */
    get output_file_name() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.ffmpegtask_output_file_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * 获取当前进度 JSON
     * @returns {string}
     */
    progress_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.ffmpegtask_progress_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * 设置 FFmpeg 参数（JSON 数组字符串）
     * @param {string} args_json
     */
    set_args_json(args_json) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(args_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ffmpegtask_set_args_json(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * 设置输出文件名
     * @param {string} name
     */
    set_output_file(name) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.ffmpegtask_set_output_file(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {TaskState}
     */
    get state() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.ffmpegtask_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    get task_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.ffmpegtask_task_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    total_input_files() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.ffmpegtask_total_input_files(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) FfmpegTask.prototype[Symbol.dispose] = FfmpegTask.prototype.free;

/**
 * 待处理文件队列
 */
export class FileQueue {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FileQueueFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_filequeue_free(ptr, 0);
    }
    /**
     * 清空队列
     */
    clear() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.filequeue_clear(this.__wbg_ptr);
    }
    /**
     * 是否为空
     * @returns {boolean}
     */
    is_empty() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.filequeue_is_empty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * 队列长度
     * @returns {number}
     */
    len() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.filequeue_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.filequeue_new();
        this.__wbg_ptr = ret;
        FileQueueFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 查看当前文件元信息（不弹出）
     * @returns {string | undefined}
     */
    peek_info() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.filequeue_peek_info(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * 弹出当前文件的数据
     * @returns {Uint8Array | undefined}
     */
    pop_data() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.filequeue_pop_data(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * 添加文件到队列
     * @param {string} name
     * @param {Uint8Array} data
     * @param {string} mime_type
     */
    push(name, data, mime_type) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(mime_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        wasm.filequeue_push(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
    }
    /**
     * 剩余未处理数量
     * @returns {number}
     */
    remaining() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.filequeue_remaining(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * 重置游标
     */
    reset_cursor() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.filequeue_reset_cursor(this.__wbg_ptr);
    }
}
if (Symbol.dispose) FileQueue.prototype[Symbol.dispose] = FileQueue.prototype.free;

export class MediaInfoParser {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MediaInfoParserFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mediainfoparser_free(ptr, 0);
    }
    clear() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.mediainfoparser_clear(this.__wbg_ptr);
    }
    /**
     * 追加 FFmpeg 日志行
     * @param {string} line
     */
    feed(line) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(line, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.mediainfoparser_feed(this.__wbg_ptr, ptr0, len0);
    }
    constructor() {
        const ret = wasm.mediainfoparser_new();
        this.__wbg_ptr = ret;
        MediaInfoParserFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 解析已收集的日志，提取媒体信息
     *
     * FFmpeg ffprobe/stderr 输出格式（简化）：
     * `  Duration: 00:01:23.45, start: 0.000000, bitrate: 2048 kb/s`
     * `    Stream #0:0: Video: h264, yuv420p, 1920x1080, 29.97 fps`
     * `    Stream #0:1: Audio: aac, 44100 Hz, stereo`
     * @returns {MediaInfoWrapper}
     */
    parse() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfoparser_parse(this.__wbg_ptr);
        return MediaInfoWrapper.__wrap(ret);
    }
}
if (Symbol.dispose) MediaInfoParser.prototype[Symbol.dispose] = MediaInfoParser.prototype.free;

export class MediaInfoWrapper {
    constructor() {
        throw new Error('cannot invoke `new` directly');
    }
    static __wrap(ptr) {
        const obj = Object.create(MediaInfoWrapper.prototype);
        obj.__wbg_ptr = ptr;
        MediaInfoWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MediaInfoWrapperFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mediainfowrapper_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get audio_channels() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfowrapper_audio_channels(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    get audio_codec() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.mediainfowrapper_audio_codec(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get audio_sample_rate() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfowrapper_audio_sample_rate(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {bigint}
     */
    get bitrate_kbps() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfowrapper_bitrate_kbps(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {number}
     */
    get duration_sec() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfowrapper_duration_sec(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {bigint}
     */
    get file_size_bytes() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfowrapper_file_size_bytes(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {number}
     */
    get fps() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfowrapper_fps(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get height() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfowrapper_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    to_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.mediainfowrapper_to_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get video_codec() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.mediainfowrapper_video_codec(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get width() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.mediainfowrapper_width(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) MediaInfoWrapper.prototype[Symbol.dispose] = MediaInfoWrapper.prototype.free;

export class ProgressInfo {
    constructor() {
        throw new Error('cannot invoke `new` directly');
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProgressInfoFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_progressinfo_free(ptr, 0);
    }
    /**
     * 当前输出码率（kbps）
     * @returns {number}
     */
    get bitrate_kbps() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.__wbg_get_progressinfo_bitrate_kbps(this.__wbg_ptr);
        return ret;
    }
    /**
     * 当前处理速度（fps）
     * @returns {number}
     */
    get fps() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.__wbg_get_progressinfo_fps(this.__wbg_ptr);
        return ret;
    }
    /**
     * 已处理的视频帧数
     * @returns {bigint}
     */
    get frame() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.__wbg_get_progressinfo_frame(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * 完成百分比（需要知道总时长才能计算）
     * @returns {number | undefined}
     */
    get percent() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.__wbg_get_progressinfo_percent(this.__wbg_ptr);
        return ret[0] === 0 ? undefined : ret[1];
    }
    /**
     * 输出文件大小（KB）
     * @returns {number}
     */
    get size_kb() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.__wbg_get_progressinfo_size_kb(this.__wbg_ptr);
        return ret;
    }
    /**
     * 处理速度比（2.0x 表示比实时快 2 倍）
     * @returns {number}
     */
    get speed() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.__wbg_get_progressinfo_speed(this.__wbg_ptr);
        return ret;
    }
    /**
     * 已处理时间（秒）
     * @returns {number}
     */
    get time_sec() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.__wbg_get_progressinfo_time_sec(this.__wbg_ptr);
        return ret;
    }
    /**
     * 当前输出码率（kbps）
     * @param {number} arg0
     */
    set bitrate_kbps(arg0) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.__wbg_set_progressinfo_bitrate_kbps(this.__wbg_ptr, arg0);
    }
    /**
     * 当前处理速度（fps）
     * @param {number} arg0
     */
    set fps(arg0) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.__wbg_set_progressinfo_fps(this.__wbg_ptr, arg0);
    }
    /**
     * 已处理的视频帧数
     * @param {bigint} arg0
     */
    set frame(arg0) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertBigInt(arg0);
        wasm.__wbg_set_progressinfo_frame(this.__wbg_ptr, arg0);
    }
    /**
     * 完成百分比（需要知道总时长才能计算）
     * @param {number | null} [arg0]
     */
    set percent(arg0) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(arg0)) {
            _assertNum(arg0);
        }
        wasm.__wbg_set_progressinfo_percent(this.__wbg_ptr, !isLikeNone(arg0), isLikeNone(arg0) ? 0 : arg0);
    }
    /**
     * 输出文件大小（KB）
     * @param {number} arg0
     */
    set size_kb(arg0) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.__wbg_set_progressinfo_size_kb(this.__wbg_ptr, arg0);
    }
    /**
     * 处理速度比（2.0x 表示比实时快 2 倍）
     * @param {number} arg0
     */
    set speed(arg0) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.__wbg_set_progressinfo_speed(this.__wbg_ptr, arg0);
    }
    /**
     * 已处理时间（秒）
     * @param {number} arg0
     */
    set time_sec(arg0) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.__wbg_set_progressinfo_time_sec(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) ProgressInfo.prototype[Symbol.dispose] = ProgressInfo.prototype.free;

export class ProgressParser {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProgressParserFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_progressparser_free(ptr, 0);
    }
    /**
     * 获取最近一次解析的进度
     * @returns {string}
     */
    last_progress_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            _assertNum(this.__wbg_ptr);
            const ret = wasm.progressparser_last_progress_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} total_duration_sec
     */
    constructor(total_duration_sec) {
        const ret = wasm.progressparser_new(total_duration_sec);
        this.__wbg_ptr = ret;
        ProgressParserFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 解析一行 FFmpeg 日志，返回进度 JSON（如果该行含进度信息）
     *
     * FFmpeg 进度行格式示例：
     * `frame=  120 fps= 60 q=28.0 size=    512kB time=00:00:04.00 bitrate=1048.6kbits/s speed=2.00x`
     * @param {string} line
     * @returns {string | undefined}
     */
    parse_line(line) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(line, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.progressparser_parse_line(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * 更新总时长（当从视频元数据获取后调用）
     * @param {number} sec
     */
    set_total_duration(sec) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.progressparser_set_total_duration(this.__wbg_ptr, sec);
    }
}
if (Symbol.dispose) ProgressParser.prototype[Symbol.dispose] = ProgressParser.prototype.free;

/**
 * 在 WASM 线性内存中分配缓冲区，暴露指针给 JS 直接写入
 * 避免 JS→WASM 的数据拷贝
 */
export class SharedBuffer {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SharedBufferFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sharedbuffer_free(ptr, 0);
    }
    /**
     * 填充为 0
     */
    clear() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.sharedbuffer_clear(this.__wbg_ptr);
    }
    /**
     * 获取数据副本（不消耗 self）
     * @returns {Uint8Array}
     */
    get_data() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.sharedbuffer_get_data(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * 是否为空
     * @returns {boolean}
     */
    is_empty() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.sharedbuffer_is_empty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * 缓冲区长度
     * @returns {number}
     */
    len() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.sharedbuffer_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * 分配指定大小的缓冲区
     * @param {number} size
     */
    constructor(size) {
        _assertNum(size);
        const ret = wasm.sharedbuffer_new(size);
        this.__wbg_ptr = ret;
        SharedBufferFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 返回缓冲区在 WASM 线性内存中的指针
     * JS 可通过 `new Uint8Array(wasm.memory.buffer, ptr, len)` 直接访问
     * @returns {number}
     */
    ptr() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.sharedbuffer_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * 从指定偏移读取数据
     * @param {number} offset
     * @param {number} length
     * @returns {Uint8Array}
     */
    read_at(offset, length) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(offset);
        _assertNum(length);
        const ret = wasm.sharedbuffer_read_at(this.__wbg_ptr, offset, length);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * 调整缓冲区大小（保留已有数据）
     * @param {number} new_size
     */
    resize(new_size) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(new_size);
        wasm.sharedbuffer_resize(this.__wbg_ptr, new_size);
    }
    /**
     * 从 JS 写入数据后，取出内部 Vec（消耗 self）
     * 使用场景：JS 通过指针填充数据后，Rust 取出处理
     * @returns {Uint8Array}
     */
    take_data() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        const ptr = this.__destroy_into_raw();
        _assertNum(ptr);
        const ret = wasm.sharedbuffer_take_data(ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) SharedBuffer.prototype[Symbol.dispose] = SharedBuffer.prototype.free;

/**
 * @enum {0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}
 */
export const TaskState = Object.freeze({
    Idle: 0, "0": "Idle",
    Initializing: 1, "1": "Initializing",
    WritingFiles: 2, "2": "WritingFiles",
    Executing: 3, "3": "Executing",
    ReadingOutput: 4, "4": "ReadingOutput",
    Cleanup: 5, "5": "Cleanup",
    Done: 6, "6": "Done",
    Failed: 7, "7": "Failed",
    Cancelled: 8, "8": "Cancelled",
});

/**
 * @enum {0 | 1 | 2 | 3}
 */
export const VideoCodec = Object.freeze({
    /**
     * H.264，兼容性最佳
     */
    H264: 0, "0": "H264",
    /**
     * H.265，压缩率更高
     */
    H265: 1, "1": "H265",
    /**
     * VP9，WebM 容器
     */
    Vp9: 2, "2": "Vp9",
    /**
     * 流复制（不重新编码，速度极快）
     */
    Copy: 3, "3": "Copy",
});

/**
 * 计算数据的 Adler-32 校验和（轻量，适合 WASM）
 * @param {Uint8Array} data
 * @returns {number}
 */
export function adler32(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.adler32(ptr0, len0);
    return ret >>> 0;
}

/**
 * 构建「多片段合并」命令（concat demuxer 方式）
 * @param {string} concat_list_name
 * @param {string} output_name
 * @param {number} width
 * @param {number} height
 * @param {number} fps
 * @param {number} video_bitrate_kbps
 * @param {number} audio_bitrate_kbps
 * @returns {string}
 */
export function build_concat_command(concat_list_name, output_name, width, height, fps, video_bitrate_kbps, audio_bitrate_kbps) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(concat_list_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(output_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        _assertNum(width);
        _assertNum(height);
        _assertNum(video_bitrate_kbps);
        _assertNum(audio_bitrate_kbps);
        const ret = wasm.build_concat_command(ptr0, len0, ptr1, len1, width, height, fps, video_bitrate_kbps, audio_bitrate_kbps);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * 构建「提取音频」命令
 * @param {string} input_name
 * @param {string} output_name
 * @param {string} format_str
 * @param {number} bitrate_kbps
 * @returns {string}
 */
export function build_extract_audio_command(input_name, output_name, format_str, bitrate_kbps) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(input_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(output_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(format_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        _assertNum(bitrate_kbps);
        const ret = wasm.build_extract_audio_command(ptr0, len0, ptr1, len1, ptr2, len2, bitrate_kbps);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * 构建「生成缩略图」命令
 * @param {string} input_name
 * @param {string} output_name
 * @param {number} time_sec
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function build_thumbnail_command(input_name, output_name, time_sec, width, height) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(input_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(output_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        _assertNum(width);
        _assertNum(height);
        const ret = wasm.build_thumbnail_command(ptr0, len0, ptr1, len1, time_sec, width, height);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * 构建「格式转换」命令
 * @param {string} input_name
 * @param {string} output_name
 * @param {string} container_str
 * @param {number} video_bitrate_kbps
 * @param {number} audio_bitrate_kbps
 * @param {number} width
 * @param {number} height
 * @param {number} fps
 * @returns {string}
 */
export function build_transcode_command(input_name, output_name, container_str, video_bitrate_kbps, audio_bitrate_kbps, width, height, fps) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(input_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(output_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(container_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        _assertNum(video_bitrate_kbps);
        _assertNum(audio_bitrate_kbps);
        _assertNum(width);
        _assertNum(height);
        const ret = wasm.build_transcode_command(ptr0, len0, ptr1, len1, ptr2, len2, video_bitrate_kbps, audio_bitrate_kbps, width, height, fps);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * 构建「单文件裁剪」命令
 * @param {string} input_name
 * @param {string} output_name
 * @param {number} start_sec
 * @param {number} duration_sec
 * @param {boolean} use_stream_copy
 * @returns {string}
 */
export function build_trim_command(input_name, output_name, start_sec, duration_sec, use_stream_copy) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(input_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(output_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        _assertBoolean(use_stream_copy);
        const ret = wasm.build_trim_command(ptr0, len0, ptr1, len1, start_sec, duration_sec, use_stream_copy);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * 构建「生成波形图数据」命令（提取 PCM 用于 JS 绘制）
 * @param {string} input_name
 * @param {string} output_name
 * @param {number} sample_rate
 * @returns {string}
 */
export function build_waveform_command(input_name, output_name, sample_rate) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(input_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(output_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        _assertNum(sample_rate);
        const ret = wasm.build_waveform_command(ptr0, len0, ptr1, len1, sample_rate);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * 简单的文件魔数检测，判断文件类型
 * @param {Uint8Array} data
 * @returns {string}
 */
export function detect_mime_type(data) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.detect_mime_type(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * 生成 FFmpeg concat demuxer 所需的文件列表内容
 * 格式：
 * ```
 * file 'segment_0.mp4'
 * file 'segment_1.mp4'
 * ```
 * @param {string} file_names_json
 * @returns {string}
 */
export function generate_concat_list(file_names_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(file_names_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_concat_list(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * 生成带时间偏移的 concat 列表（用于精确拼接）
 * @param {string} segments_json
 * @returns {string}
 */
export function generate_concat_list_with_offsets(segments_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(segments_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_concat_list_with_offsets(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

export function init() {
    wasm.init();
}

//#endregion

//#region wasm imports
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_debug_78b457f1effb3792: function() { return logError(function (arg0) {
            console.debug(arg0);
        }, arguments); },
        __wbg_error_78ff5b3a29b770e0: function() { return logError(function (arg0) {
            console.error(arg0);
        }, arguments); },
        __wbg_error_a6fa202b58aa1cd3: function() { return logError(function (arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        }, arguments); },
        __wbg_info_af7f45292ba9b0ea: function() { return logError(function (arg0) {
            console.info(arg0);
        }, arguments); },
        __wbg_log_cf2e968649f3384e: function() { return logError(function (arg0) {
            console.log(arg0);
        }, arguments); },
        __wbg_new_227d7c05414eb861: function() { return logError(function () {
            const ret = new Error();
            return ret;
        }, arguments); },
        __wbg_new_from_slice_18fa1f71286d66b8: function() { return logError(function (arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_stack_3b0d974bbf31e44f: function() { return logError(function (arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_warn_410c3261e3c6d686: function() { return logError(function (arg0) {
            console.warn(arg0);
        }, arguments); },
        __wbindgen_cast_0000000000000001: function() { return logError(function (arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        }, arguments); },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./ffmpeg_bridge_bg.js": import0,
    };
}


//#endregion
const ChunkTransferFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_chunktransfer_free(ptr, 1));
const FfmpegTaskFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ffmpegtask_free(ptr, 1));
const FileQueueFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_filequeue_free(ptr, 1));
const MediaInfoParserFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mediainfoparser_free(ptr, 1));
const MediaInfoWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mediainfowrapper_free(ptr, 1));
const ProgressInfoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_progressinfo_free(ptr, 1));
const ProgressParserFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_progressparser_free(ptr, 1));
const SharedBufferFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sharedbuffer_free(ptr, 1));


//#region intrinsics
function _assertBigInt(n) {
    if (typeof(n) !== 'bigint') throw new Error(`expected a bigint argument, found ${typeof(n)}`);
}

function _assertBoolean(n) {
    if (typeof(n) !== 'boolean') {
        throw new Error(`expected a boolean argument, found ${typeof(n)}`);
    }
}

function _assertNum(n) {
    if (typeof(n) !== 'number') throw new Error(`expected a number argument, found ${typeof(n)}`);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function logError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        let error = (function () {
            try {
                return e instanceof Error ? `${e.message}\n\nStack:\n${e.stack}` : e.toString();
            } catch(_) {
                return "<failed to stringify thrown value>";
            }
        }());
        console.error("wasm-bindgen: imported JS function that was not marked as `catch` threw an error:", error);
        throw e;
    }
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (typeof(arg) !== 'string') throw new Error(`expected a string argument, found ${typeof(arg)}`);
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);
        if (ret.read !== arg.length) throw new Error('failed to pass whole string');
        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;


//#endregion

//#region wasm loading
let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('ffmpeg_bridge_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
//#endregion
export { wasm as __wasm }
