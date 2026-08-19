> ## Documentation Index
> Fetch the complete documentation index at: https://docs.sglang.io/llms.txt
> Use this file to discover all available pages before exploring further.

# MiniMax-H3

> Run native MiniMax-H3 video-and-audio generation with SGLang Diffusion.

export const config = {
  modelName: "MiniMax-H3",
  supportedHardware: ["b200", "b300", "h200", "h100", "mi300x", "mi355x", "rtx5090"],
  hardware: [{
    id: "rtx5090",
    label: "RTX 5090",
    vram: "32GB",
    vendor: "consumer"
  }],
  groupHardware: false,
  matchDims: [{
    id: "profile",
    title: "Deployment Profile",
    showWhen: s => ["b200", "b300", "h200", "h100"].includes(s.hw),
    options: [{
      id: "resident",
      label: "Resident"
    }, {
      id: "fsdp",
      label: "FSDP sharded",
      showWhen: s => ["b200", "b300", "h200", "h100"].includes(s.hw)
    }, {
      id: "offload",
      label: "Layerwise offload",
      showWhen: s => s.hw === "rtx5090"
    }, {
      id: "cross_node",
      label: "Cross-node (2 nodes)",
      showWhen: s => s.hw === "h200"
    }]
  }],
  overlayDims: [{
    id: "weights",
    title: "Checkpoint Weights",
    default: "fl2va",
    options: [{
      id: "fl2va",
      label: "FL2VA (First-and-Last-Frame-to-Video-and-Audio)",
      flags: ["--model-variant fl2va"]
    }, {
      id: "ref2va",
      label: "Ref2VA (Reference-to-Video-and-Audio)",
      flags: ["--model-variant ref2va"]
    }]
  }, {
    id: "mode",
    title: "Request Mode",
    default: "t2va",
    options: [{
      id: "t2va",
      label: "Text only",
      showWhen: s => s.weights === "fl2va"
    }, {
      id: "i2va",
      label: "First frame",
      showWhen: s => s.weights === "fl2va"
    }, {
      id: "l2va",
      label: "Last frame",
      showWhen: s => s.weights === "fl2va"
    }, {
      id: "fl2va",
      label: "First + last frames",
      showWhen: s => s.weights === "fl2va"
    }, {
      id: "ref_image",
      label: "Image reference",
      showWhen: s => s.weights === "ref2va"
    }, {
      id: "ref_image_audio",
      label: "Image + audio",
      showWhen: s => s.weights === "ref2va"
    }, {
      id: "v2v",
      label: "Video reference",
      showWhen: s => s.weights === "ref2va"
    }, {
      id: "video_audio",
      label: "Video + soundtrack",
      showWhen: s => s.weights === "ref2va"
    }, {
      id: "audio_only",
      label: "Audio reference",
      showWhen: s => s.weights === "ref2va"
    }, {
      id: "mixed_ref",
      label: "Mixed references",
      showWhen: s => s.weights === "ref2va"
    }]
  }, {
    id: "quant",
    title: "Online Quantization",
    default: "bf16",
    showWhen: s => ["b200", "b300"].includes(s.hw),
    options: [{
      id: "bf16",
      label: "Off — Native BF16/FP32"
    }, {
      id: "fp8",
      label: "FP8 — Approximate",
      showWhen: s => ["b200", "b300"].includes(s.hw),
      disabled: s => s.profile !== "resident",
      disableReason: "The documented FP8 operating point keeps the transformer resident; FSDP combinations have not been validated.",
      flags: ["--quantization fp8"],
      hints: ["Online FP8 is approximate. Validate both video and audio quality;", "verified B200 and B300 runs reduced memory; re-benchmark latency on the target workload."]
    }]
  }, {
    id: "encoder",
    title: "Text Encoder Parallel",
    default: "auto",
    options: [{
      id: "auto",
      label: "Auto (recommended)",
      hints: ["Auto uses folding for the single-request recipes below and can", "select data parallel encoding for a compatible TP1 request batch."]
    }, {
      id: "fold",
      label: "Fold (single-request)",
      flags: ["--encoder-parallel fold"],
      hints: ["Fold shards the resident Qwen3-VL encoder across the replica and is", "best suited to single-node GPUs with fast peer-to-peer links."]
    }, {
      id: "dp",
      label: "DP (batched throughput)",
      disabled: s => s.hw === "rtx5090" || s.hw === "h100" && s.profile === "resident",
      disableReason: "Encoder DP requires TP1 and DiT DP1; this verified recipe uses TP2.",
      flags: ["--encoder-parallel dp", "--batching-max-size {{BATCHING_MAX_SIZE}}"],
      hints: ["DP distributes a compatible multi-request text batch across ranks;", "it does not improve a batch of one and replicates encoder weights."]
    }, {
      id: "replicate",
      label: "Replicate (compatibility)",
      flags: ["--encoder-parallel replicate"]
    }]
  }],
  modelNames: {
    default: "MiniMaxAI/MiniMax-H3"
  },
  placeholders: {
    HOST_IP: {
      target: "command",
      label: "Bind host",
      default: "0.0.0.0"
    },
    PORT: {
      target: "command",
      label: "Bind port",
      default: "30010"
    },
    HF_TOKEN: {
      target: "command",
      label: "HF token (Docker)",
      default: "<your-hf-token>"
    },
    MEDIA_DIR: {
      target: "command",
      label: "Host media directory (Docker)",
      default: "/data/minimax-h3"
    },
    CURL_HOST: {
      target: "curl",
      label: "Server host",
      default: "localhost"
    },
    CURL_PORT: {
      target: "curl",
      label: "Server port",
      default: "30010"
    },
    NUM_OUTPUTS: {
      target: "curl",
      label: "Outputs per prompt (1-10)",
      default: "1"
    },
    BATCHING_MAX_SIZE: {
      target: "command",
      label: "Maximum request batch size",
      default: "2"
    },
    DURATION_SECONDS: {
      target: "curl",
      label: "Duration (seconds, 4-15)",
      default: "5"
    },
    FIRST_FRAME: {
      target: "curl",
      label: "FL2VA first frame URI",
      default: "file:///data/minimax-h3/first-frame.png"
    },
    LAST_FRAME: {
      target: "curl",
      label: "FL2VA last frame URI",
      default: "file:///data/minimax-h3/last-frame.png"
    },
    INPUT_VIDEO: {
      target: "curl",
      label: "First video URI",
      default: "file:///data/minimax-h3/video-1.mp4"
    },
    INPUT_VIDEO_START_SECONDS: {
      target: "curl",
      label: "First video start (seconds)",
      default: "0"
    },
    SECOND_INPUT_VIDEO: {
      target: "curl",
      label: "Second video URI (mixed ref)",
      default: "file:///data/minimax-h3/video-2.mp4"
    },
    SECOND_INPUT_VIDEO_START_SECONDS: {
      target: "curl",
      label: "Second video start (seconds)",
      default: "0"
    },
    REFERENCE_IMAGE: {
      target: "curl",
      label: "First reference image URI",
      default: "file:///data/minimax-h3/reference-1.png"
    },
    SECOND_REFERENCE_IMAGE: {
      target: "curl",
      label: "Second reference image URI",
      default: "file:///data/minimax-h3/reference-2.png"
    },
    REFERENCE_AUDIO: {
      target: "curl",
      label: "First reference audio URI",
      default: "file:///data/minimax-h3/reference-1.mp3"
    },
    SECOND_REFERENCE_AUDIO: {
      target: "curl",
      label: "Second reference audio URI",
      default: "file:///data/minimax-h3/reference-2.mp3"
    }
  },
  curl: s => {
    const request = {
      model: "{{MODEL_NAME}}",
      prompt: "Night-vision bedroom footage: while the owner sleeps, three cats burst in playing tiny brass instruments at full volume, freeze, then march out as if nothing happened.",
      seconds: "{{DURATION_SECONDS}}",
      task: "t2va",
      conditions: [],
      target: {
        short_edge: 768,
        aspect_ratio: "16:9",
        duration_seconds: "{{DURATION_SECONDS}}"
      },
      num_outputs_per_prompt: "{{NUM_OUTPUTS}}",
      num_inference_steps: 50,
      flow_shift: 12.0,
      audio_flow_shift: 3.0,
      seed: 1101
    };
    const imageReference = uri => ({
      type: "image",
      uri,
      role: "reference"
    });
    const audioReference = uri => ({
      type: "audio",
      uri,
      role: "reference"
    });
    const videoReference = (uri, start, type = "video") => ({
      type,
      uri,
      role: "reference",
      start_time_seconds: start
    });
    if (["i2va", "l2va", "fl2va"].includes(s.mode)) {
      request.task = "fl2va";
      request.prompt = "Continue naturally between the supplied endpoint frame or frames, with synchronized ambient sound.";
      request.target.aspect_ratio = "auto";
      request.seed = 2101;
      request.conditions = [];
      if (s.mode !== "l2va") {
        request.conditions.push({
          type: "image",
          uri: "{{FIRST_FRAME}}",
          role: "keyframe",
          frame_index: 0
        });
      }
      if (s.mode !== "i2va") {
        request.conditions.push({
          type: "image",
          uri: "{{LAST_FRAME}}",
          role: "keyframe",
          frame_index: -1
        });
      }
    } else if (s.mode === "ref_image") {
      request.task = "ref2va";
      request.prompt = "Use <Picture 1> as the visual subject and style reference.";
      request.target.aspect_ratio = "auto";
      request.conditions = [imageReference("{{REFERENCE_IMAGE}}")];
      request.seed = 3101;
    } else if (s.mode === "ref_image_audio") {
      request.task = "ref2va";
      request.prompt = "Use <Picture 1> as the visual subject and <Audio 1> as the sound reference.";
      request.target.aspect_ratio = "auto";
      request.conditions = [imageReference("{{REFERENCE_IMAGE}}"), audioReference("{{REFERENCE_AUDIO}}")];
      request.seed = 3102;
    } else if (s.mode === "v2v" || s.mode === "video_audio") {
      request.task = "ref2va";
      request.prompt = s.mode === "video_audio" ? "Follow <Video 1> and its required <Audio 1> soundtrack with coherent synchronized motion." : "Follow the appearance and motion of <Video 1>; use its soundtrack when present.";
      request.conditions = [videoReference("{{INPUT_VIDEO}}", "{{INPUT_VIDEO_START_SECONDS}}", s.mode === "video_audio" ? "video_audio" : "video")];
      request.seed = s.mode === "video_audio" ? 4102 : 4101;
    } else if (s.mode === "audio_only") {
      request.task = "ref2va";
      request.prompt = "Build a coherent visual scene around <Audio 1>.";
      request.conditions = [audioReference("{{REFERENCE_AUDIO}}")];
      request.seed = 3103;
    } else if (s.mode === "mixed_ref") {
      request.task = "ref2va";
      request.prompt = "Combine <Picture 1>, <Picture 2>, <Audio 1>, <Audio 2>, <Video 1>, and <Video 2> in their one-based modality order.";
      request.conditions = [imageReference("{{REFERENCE_IMAGE}}"), imageReference("{{SECOND_REFERENCE_IMAGE}}"), audioReference("{{REFERENCE_AUDIO}}"), audioReference("{{SECOND_REFERENCE_AUDIO}}"), videoReference("{{INPUT_VIDEO}}", "{{INPUT_VIDEO_START_SECONDS}}"), videoReference("{{SECOND_INPUT_VIDEO}}", "{{SECOND_INPUT_VIDEO_START_SECONDS}}")];
      request.seed = 3104;
    }
    const body = JSON.stringify(request, null, 2).replace(/"{{(NUM_OUTPUTS|DURATION_SECONDS|INPUT_VIDEO_START_SECONDS|SECOND_INPUT_VIDEO_START_SECONDS)}}"/g, "{{$1}}");
    return `curl -sS -X POST http://{{CURL_HOST}}:{{CURL_PORT}}/v1/videos \\
  -H 'Content-Type: application/json' \\
  -d '${body}'`;
  },
  dockerMounts: ["{{MEDIA_DIR}}:/data/minimax-h3:ro"],
  dockerRunCommand: s => ["mi300x", "mi355x"].includes(s.hw) ? `bash -lc 'python -m pip install -e "/sgl-workspace/sglang/python[diffusion_hip]" && exec sglang serve "$@"' --` : `bash -lc 'python -m pip install -e "/sgl-workspace/sglang/python[diffusion]" && exec sglang serve "$@"' --`,
  runModes: s => ["mi300x", "mi355x"].includes(s.hw) ? ["python"] : ["python", "docker"],
  dockerImages: {
    b200: "lmsysorg/sglang:dev",
    b300: "lmsysorg/sglang:dev",
    h200: "lmsysorg/sglang:dev",
    h100: "lmsysorg/sglang:dev"
  },
  showPlaygroundLink: false,
  cells: [{
    match: {
      hw: "b200",
      profile: "resident"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 8", "--ulysses-degree 8", "--performance-mode speed", "--host {{HOST_IP}}", "--port {{PORT}}"]
  }, {
    match: {
      hw: "b300",
      profile: "resident"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 8", "--ulysses-degree 8", "--performance-mode speed", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "This is the B300 topology used for the documented benchmark sweep, not a claimed minimum GPU count."
  }, {
    match: {
      hw: "h200",
      profile: "resident"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 4", "--ulysses-degree 4", "--performance-mode speed", "--host {{HOST_IP}}", "--port {{PORT}}"]
  }, {
    match: {
      hw: "b300",
      profile: "fsdp"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 8", "--ulysses-degree 8", "--performance-mode speed", "--use-fsdp-inference true", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "FSDP reduces resident DiT memory but adds per-block parameter collectives. Prefer Resident when the full pipeline fits."
  }, {
    match: {
      hw: "h200",
      profile: "fsdp"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 4", "--ulysses-degree 4", "--performance-mode speed", "--use-fsdp-inference true", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "FSDP reduces resident DiT memory but adds per-block parameter collectives. Prefer Resident when the full pipeline fits."
  }, {
    match: {
      hw: "h200",
      profile: "cross_node"
    },
    nnodes: 2,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 16", "--sp-degree 16", "--ulysses-degree 8", "--ring-degree 2", "--encoder-parallel replicate", "--performance-mode speed", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "Verified on 2 nodes of 8× H200 each (Ulysses8 within a node, Ring2 across nodes). Requires --encoder-parallel replicate: --encoder-parallel auto's fold decision is not yet node-boundary aware and will crash across nodes."
  }, {
    match: {
      hw: "b200",
      profile: "fsdp"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 4", "--ulysses-degree 4", "--performance-mode speed", "--use-fsdp-inference true", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "The 4-GPU FSDP path is lossless but slower than the 8-GPU resident recipe."
  }, {
    match: {
      hw: "h100",
      profile: "resident"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 4", "--tp-size 2", "--ulysses-degree 2", "--performance-mode speed", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "Fastest measured 4× H100 80 GB topology. TP4 + Ulysses1 lowers peak memory at a small latency cost."
  }, {
    match: {
      hw: "h100",
      profile: "fsdp"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 4", "--ulysses-degree 4", "--performance-mode speed", "--use-fsdp-inference true", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "Capacity path on 4× H100 80 GB. Prefer the resident TP2 + Ulysses2 profile for latency."
  }, {
    match: {
      hw: "mi300x",
      profile: "resident"
    },
    nnodes: 1,
    verified: true,
    env: ["SGLANG_USE_AITER=1"],
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 8", "--ulysses-degree 8", "--performance-mode speed", "--attention-backend aiter", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "Validated on 1×, 2×, 4×, and 8× MI300X with BF16 and AITER packed attention. The picker emits the fastest measured 8-GPU topology; set --num-gpus and --ulysses-degree to the same lower count for a measured capacity recipe."
  }, {
    match: {
      hw: "mi355x",
      profile: "resident"
    },
    nnodes: 1,
    verified: true,
    env: ["SGLANG_USE_AITER=1"],
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 8", "--ulysses-degree 8", "--performance-mode speed", "--attention-backend aiter", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "Validated on 1×, 2×, 4×, and 8× MI355X with BF16 and AITER packed attention. The picker emits the fastest measured 8-GPU topology; set --num-gpus and --ulysses-degree to the same lower count for a measured capacity recipe."
  }, {
    match: {
      hw: "rtx5090",
      profile: "offload"
    },
    nnodes: 1,
    verified: true,
    flags: ["--model-path {{MODEL_NAME}}", "--num-gpus 2", "--tp-size 2", "--ulysses-degree 1", "--performance-mode memory", "--layerwise-offload-components dit,text_encoder,vae", "--dit-offload-prefetch-size 1", "--dit-layerwise-resident-layers 20", "--enable-torch-compile false", "--host {{HOST_IP}}", "--port {{PORT}}"],
    warn: "Validated lossless BF16/FP32 recipe on 2× RTX 5090 (32 GB each) with a 384 GiB-class host. TP2 avoids the full per-rank DiT replication observed with Ulysses2 on PCIe."
  }]
};

export const Deployment = ({config, benchmarks}) => {
  if (!config) {
    return <div style={{
      padding: 12,
      color: "#b91c1c"
    }}>Deployment: missing <code>config</code> prop</div>;
  }
  const HARDWARE_CATALOG = {
    blackwell: [{
      id: "b300",
      label: "B300",
      vram: "288GB"
    }, {
      id: "gb300",
      label: "GB300",
      vram: "288GB"
    }, {
      id: "b200",
      label: "B200",
      vram: "192GB"
    }, {
      id: "gb200",
      label: "GB200",
      vram: "192GB"
    }, {
      id: "dgx-spark",
      label: "DGX Spark",
      vram: "128GB",
      multiNodeDockerFlags: ["--ulimit memlock=-1:-1", "--cap-add IPC_LOCK", "--device /dev/infiniband"]
    }],
    hopper: [{
      id: "h200",
      label: "H200",
      vram: "141GB"
    }, {
      id: "h100",
      label: "H100",
      vram: "80GB"
    }, {
      id: "h20-3e",
      label: "H20-3e",
      vram: "141GB"
    }, {
      id: "h800",
      label: "H800",
      vram: "80GB"
    }],
    amd: [{
      id: "mi300x",
      label: "MI300X",
      vram: "192GB"
    }, {
      id: "mi325x",
      label: "MI325X",
      vram: "256GB"
    }, {
      id: "mi350x",
      label: "MI350X",
      vram: "288GB"
    }, {
      id: "mi355x",
      label: "MI355X",
      vram: "288GB"
    }]
  };
  const makeStyles = isDark => ({
    container: {
      maxWidth: "900px",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: "3px"
    },
    card: {
      padding: "5px 10px",
      border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
      borderLeft: `3px solid ${isDark ? "#E85D4D" : "#D45D44"}`,
      borderRadius: "4px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      background: isDark ? "#1f2937" : "#fff"
    },
    cardColumn: {
      padding: "5px 10px",
      border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
      borderLeft: `3px solid ${isDark ? "#E85D4D" : "#D45D44"}`,
      borderRadius: "4px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      background: isDark ? "#1f2937" : "#fff"
    },
    title: {
      fontSize: "12px",
      fontWeight: "600",
      minWidth: "108px",
      flexShrink: 0,
      color: isDark ? "#e5e7eb" : "inherit"
    },
    vendorRow: {
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    vendorLabel: {
      fontSize: "10px",
      fontWeight: "600",
      color: isDark ? "#9ca3af" : "#6b7280",
      width: "68px",
      flexShrink: 0,
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    },
    itemsGrid: () => ({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
      gap: "4px",
      flex: 1
    }),
    labelBase: {
      padding: "2px 8px",
      border: `1px solid ${isDark ? "#9ca3af" : "#d1d5db"}`,
      borderRadius: "3px",
      cursor: "pointer",
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "500",
      fontSize: "12px",
      transition: "all 0.2s",
      userSelect: "none",
      minHeight: "26px",
      textAlign: "center",
      background: isDark ? "#374151" : "#fff",
      color: isDark ? "#e5e7eb" : "inherit"
    },
    checked: {
      background: "#D45D44",
      color: "white",
      borderColor: "#D45D44"
    },
    disabled: {
      cursor: "not-allowed",
      opacity: 0.4
    },
    subtitle: {
      display: "block",
      fontSize: "9px",
      marginTop: "1px",
      lineHeight: "1.1",
      opacity: 0.7
    },
    commandWrap: {
      position: "relative",
      flex: 1,
      background: isDark ? "#111827" : "#f5f5f5",
      borderRadius: "6px",
      border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
      overflow: "hidden"
    },
    commandHeader: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "6px 10px",
      padding: "6px 10px",
      borderBottom: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
      background: isDark ? "#1f2937" : "#fafafa"
    },
    commandPre: {
      padding: "12px 16px",
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: "12px",
      lineHeight: "1.5",
      color: isDark ? "#e5e7eb" : "#374151",
      whiteSpace: "pre-wrap",
      overflowX: "auto",
      margin: 0
    },
    mtpWarn: {
      margin: "8px 0 0",
      padding: "8px 12px",
      borderRadius: "8px",
      fontSize: "12px",
      lineHeight: "1.45",
      background: isDark ? "#78350f" : "#fef3c7",
      color: isDark ? "#fde68a" : "#92400e",
      border: `1px solid ${isDark ? "#92400e" : "#fcd34d"}`
    },
    badge: status => ({
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "2px 8px",
      borderRadius: "10px",
      background: ({
        verified: isDark ? "#064e3b" : "#d1fae5",
        "in-progress": isDark ? "#1e3a8a" : "#dbeafe",
        unverified: isDark ? "#78350f" : "#fef3c7"
      })[verifyStatusOf(status)],
      color: ({
        verified: isDark ? "#a7f3d0" : "#065f46",
        "in-progress": isDark ? "#bfdbfe" : "#1e40af",
        unverified: isDark ? "#fde68a" : "#92400e"
      })[verifyStatusOf(status)],
      fontSize: "11px",
      fontWeight: 600,
      whiteSpace: "nowrap"
    }),
    badgeDot: status => ({
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: ({
        verified: "#10b981",
        "in-progress": "#3b82f6",
        unverified: "#f59e0b"
      })[verifyStatusOf(status)]
    }),
    iconButton: {
      padding: "4px 10px",
      border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
      borderRadius: "4px",
      background: isDark ? "#1f2937" : "#fff",
      color: isDark ? "#e5e7eb" : "#374151",
      fontSize: "11px",
      fontWeight: 500,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px"
    },
    iconRow: {
      display: "inline-flex",
      flexWrap: "wrap",
      gap: "6px"
    },
    runModeWrap: {
      display: "inline-flex",
      border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
      borderRadius: "10px",
      overflow: "hidden",
      fontSize: "11px",
      fontWeight: 600,
      userSelect: "none"
    },
    runModeChip: active => ({
      padding: "2px 10px",
      cursor: "pointer",
      background: active ? isDark ? "#1f2937" : "#fff" : "transparent",
      color: active ? isDark ? "#e5e7eb" : "#111827" : isDark ? "#9ca3af" : "#6b7280",
      borderRight: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`
    }),
    runModeChipLast: active => ({
      padding: "2px 10px",
      cursor: "pointer",
      background: active ? isDark ? "#1f2937" : "#fff" : "transparent",
      color: active ? isDark ? "#e5e7eb" : "#111827" : isDark ? "#9ca3af" : "#6b7280"
    }),
    headerLeft: {
      display: "inline-flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "8px"
    },
    modalBackdrop: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999
    },
    modalBox: {
      background: isDark ? "#1f2937" : "#fff",
      color: isDark ? "#e5e7eb" : "#111827",
      borderRadius: "8px",
      padding: "20px",
      maxWidth: "720px",
      width: "92%",
      maxHeight: "85vh",
      overflowY: "auto",
      border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
      boxShadow: "0 10px 25px rgba(0,0,0,0.25)"
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "12px"
    },
    modalTitle: {
      fontSize: "15px",
      fontWeight: 600
    },
    modalCloseBtn: {
      background: "transparent",
      border: "none",
      color: "inherit",
      fontSize: "20px",
      cursor: "pointer",
      padding: "0 6px",
      lineHeight: 1
    },
    formField: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      marginBottom: "10px"
    },
    formLabel: {
      fontSize: "12px",
      fontWeight: 500,
      color: isDark ? "#9ca3af" : "#4b5563"
    },
    formInput: {
      padding: "6px 10px",
      fontSize: "13px",
      border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
      borderRadius: "4px",
      background: isDark ? "#111827" : "#fff",
      color: isDark ? "#e5e7eb" : "#111827",
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace"
    },
    sectionHeading: {
      fontSize: "12px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: isDark ? "#9ca3af" : "#6b7280",
      margin: "12px 0 6px 0"
    },
    primaryBtn: {
      padding: "6px 14px",
      background: "#D45D44",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: 500
    },
    benchCard: {
      padding: "8px 12px",
      border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
      borderLeft: `3px solid ${isDark ? "#E85D4D" : "#D45D44"}`,
      borderRadius: "4px",
      background: isDark ? "#1f2937" : "#fff",
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    benchHeader: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "6px 12px"
    },
    benchTitle: {
      fontSize: "13px",
      fontWeight: 600,
      color: isDark ? "#e5e7eb" : "inherit"
    },
    benchVersion: {
      fontSize: "11px",
      color: isDark ? "#9ca3af" : "#6b7280"
    },
    benchHeaderRight: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "6px 10px",
      flexShrink: 0
    },
    benchChipRow: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexWrap: "wrap",
      margin: "2px 0 8px"
    },
    benchChip: {
      padding: "2px 10px",
      fontSize: "12px",
      cursor: "pointer",
      border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
      borderRadius: "4px",
      background: isDark ? "#1f2937" : "#fff",
      color: isDark ? "#e5e7eb" : "#374151",
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace"
    },
    benchChipActive: {
      background: "#D45D44",
      color: "white",
      borderColor: "#D45D44"
    },
    benchBlock: {
      border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
      borderRadius: "4px",
      padding: "8px 10px",
      background: isDark ? "#111827" : "#fafafa"
    },
    benchBlockTitle: {
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: isDark ? "#9ca3af" : "#6b7280",
      marginBottom: "4px"
    },
    benchWorkload: {
      fontSize: "11px",
      fontStyle: "italic",
      color: isDark ? "#9ca3af" : "#6b7280",
      marginBottom: "6px",
      lineHeight: "1.3"
    },
    benchRow: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "12px",
      padding: "2px 0"
    },
    benchKey: {
      color: isDark ? "#9ca3af" : "#6b7280"
    },
    benchVal: {
      color: isDark ? "#e5e7eb" : "#111827",
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontWeight: 500
    },
    benchNotes: {
      fontSize: "11px",
      fontStyle: "italic",
      color: isDark ? "#9ca3af" : "#6b7280"
    },
    benchLegend: {
      fontSize: "10px",
      fontStyle: "italic",
      color: isDark ? "#6b7280" : "#9ca3af",
      marginTop: "6px",
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace"
    },
    benchEmpty: {
      fontSize: "12px",
      fontStyle: "italic",
      color: isDark ? "#9ca3af" : "#6b7280"
    },
    benchTable: {
      display: "grid",
      columnGap: 0,
      rowGap: "3px",
      marginTop: "4px",
      alignItems: "baseline"
    },
    benchTableHead: {
      textAlign: "right",
      fontWeight: 500,
      fontSize: "11px",
      color: isDark ? "#9ca3af" : "#6b7280",
      paddingLeft: "16px",
      paddingBottom: "4px",
      whiteSpace: "nowrap"
    },
    benchTableCornerHead: {
      paddingBottom: "4px"
    },
    benchTableSeparator: {
      gridColumn: "1 / -1",
      height: "1px",
      background: isDark ? "#374151" : "#e5e7eb",
      marginTop: "-3px"
    },
    benchTableLabel: {
      textAlign: "left",
      fontSize: "12px",
      color: isDark ? "#9ca3af" : "#6b7280",
      whiteSpace: "nowrap"
    },
    benchTableValue: {
      textAlign: "right",
      fontSize: "12px",
      color: isDark ? "#e5e7eb" : "#111827",
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontWeight: 500,
      paddingLeft: "16px",
      whiteSpace: "nowrap"
    },
    benchTableValueMissing: {
      color: isDark ? "#6b7280" : "#9ca3af"
    }
  });
  const VERIFY_LABEL = {
    verified: "Verified",
    "in-progress": "Final Verification In Progress",
    unverified: "Not Verified"
  };
  const verifyStatusOf = v => typeof v === "string" ? VERIFY_LABEL[v] ? v : "unverified" : v ? "verified" : "unverified";
  const cellVerifyStatus = c => c ? verifyStatusOf(c.verificationStatus ?? c.verified) : "unverified";
  const LEGACY_MATCH_DIMS = [{
    id: "variant",
    title: "Model Variant",
    optionsKey: "variants"
  }, {
    id: "quant",
    title: "Quantization",
    optionsKey: "quantizations"
  }, {
    id: "strategy",
    title: "Strategy",
    optionsKey: "strategies"
  }, {
    id: "nodes",
    title: "Nodes",
    optionsKey: "nodesOptions"
  }];
  const matchDimSpecs = (config.matchDims || LEGACY_MATCH_DIMS).map(d => ({
    ...d,
    options: d.options || config[d.optionsKey] || []
  }));
  const overlayDimSpecs = config.overlayDims || [];
  const DIMENSIONS = ["hw", ...matchDimSpecs.map(d => d.id)];
  const optionVisible = (opt, sel) => typeof opt.showWhen !== "function" || opt.showWhen(sel);
  const optionDisabled = (opt, sel) => typeof opt.disabled === "function" ? opt.disabled(sel) : !!opt.disabled;
  const visibleOptions = (spec, sel) => (spec.options || []).filter(o => optionVisible(o, sel));
  const rowVisible = (spec, sel) => (typeof spec.showWhen !== "function" || spec.showWhen(sel)) && visibleOptions(spec, sel).length > 0;
  const overlayPick = sel => {
    const picked = [];
    for (const spec of config.overlayDims || []) {
      if (!rowVisible(spec, sel)) continue;
      const opt = (spec.options || []).find(o => o.id === sel[spec.id]);
      if (opt && !optionDisabled(opt, sel)) picked.push(opt);
    }
    return picked;
  };
  const overlayPart = (sel, key) => {
    const out = [];
    for (const opt of overlayPick(sel)) {
      const add = typeof opt[key] === "function" ? opt[key](sel) : opt[key];
      if (add) out.push(...add);
    }
    return out;
  };
  const overlayCompose = (cellFlags, sel) => {
    const strip = overlayPart(sel, "stripPrefixes");
    const add = overlayPart(sel, "flags");
    if (!strip.length) return [...cellFlags || [], ...add];
    const used = new Set();
    const replacementsFor = tok => {
      const out = [];
      add.forEach((f, i) => {
        if (used.has(i) || f.split(/[\s=]/)[0] !== tok) return;
        used.add(i);
        out.push(f);
      });
      return out;
    };
    const out = [];
    for (const f of cellFlags || []) {
      const tok = f.split(/[\s=]/)[0];
      if (!strip.includes(tok)) out.push(f); else out.push(...replacementsFor(tok));
    }
    add.forEach((f, i) => {
      if (!used.has(i)) out.push(f);
    });
    return out;
  };
  const findCell = (cells, sel) => cells.find(c => DIMENSIONS.every(d => c.match[d] === sel[d]));
  const findBenchmark = (list, sel) => (list || []).find(b => DIMENSIONS.every(d => b.match[d] === sel[d])) || null;
  const normalizeSpeed = speed => {
    if (!speed) return [];
    return Array.isArray(speed) ? speed : [speed];
  };
  const effectiveAccuracy = (entry, sel) => entry ? {
    ...config.defaultAccuracy && config.defaultAccuracy[sel.variant] || ({}),
    ...entry.accuracy || ({})
  } : {};
  const benchmarkIsEmpty = (entry, accuracy) => {
    for (const m of normalizeSpeed(entry && entry.speed)) {
      if (m && typeof m === "object") {
        for (const [key, v] of Object.entries(m)) {
          if (key === "workload") continue;
          if (v !== null && v !== undefined) return false;
        }
      }
    }
    if (accuracy && typeof accuracy === "object") {
      for (const v of Object.values(accuracy)) {
        if (v !== null && v !== undefined) return false;
      }
    }
    return true;
  };
  const isOptionAvailable = (cells, sel, dim, value) => {
    const idx = DIMENSIONS.indexOf(dim);
    const higher = DIMENSIONS.slice(0, idx);
    return cells.some(c => c.match[dim] === value && higher.every(d => c.match[d] === sel[d]));
  };
  const snapToValidCell = (cells, sel, dim, value) => {
    const idx = DIMENSIONS.indexOf(dim);
    const higher = DIMENSIONS.slice(0, idx);
    const lower = DIMENSIONS.slice(idx + 1);
    let best = null, bestLowerMatches = -1;
    for (const c of cells) {
      if (c.match[dim] !== value) continue;
      if (!higher.every(d => c.match[d] === sel[d])) continue;
      let s = 0;
      for (const d of lower) if (c.match[d] === sel[d]) s++;
      if (s > bestLowerMatches) {
        bestLowerMatches = s;
        best = c;
      }
    }
    if (!best) return sel;
    const next = {
      ...sel,
      [dim]: value
    };
    for (const d of lower) next[d] = best.match[d];
    return next;
  };
  const validateSelection = (cells, parsed) => {
    const valid = {};
    for (const dim of DIMENSIONS) {
      const want = parsed[dim];
      const works = cells.some(c => c.match[dim] === want && DIMENSIONS.slice(0, DIMENSIONS.indexOf(dim)).every(d => c.match[d] === valid[d]));
      if (works) {
        valid[dim] = want;
      } else {
        const fallback = cells.find(c => DIMENSIONS.slice(0, DIMENSIONS.indexOf(dim)).every(d => c.match[d] === valid[d]));
        valid[dim] = fallback ? fallback.match[dim] : want;
      }
    }
    for (const spec of overlayDimSpecs) {
      const want = parsed[spec.id];
      const opts = spec.options || [];
      valid[spec.id] = opts.some(o => o.id === want) ? want : (spec.default ?? (opts[0] && opts[0].id)) ?? "";
    }
    return valid;
  };
  const resolveModelName = sel => {
    const keys = [`${sel.hw}|${sel.variant}|${sel.quant}`, `${sel.variant}|${sel.quant}`, `${sel.hw}|${sel.quant}`, sel.quant, sel.hw, "default"];
    for (const k of keys) {
      const hit = config.modelNames[k];
      if (hit) return hit;
    }
    return "";
  };
  const interpolate = (text, env, modelName) => text.replace(/{{(\w+)}}/g, (_, key) => key === "MODEL_NAME" ? modelName : env[key] ?? `{{${key}}}`);
  const parseNnodes = id => {
    if (id === "single") return 1;
    const m = (/^multi-(\d+)$/).exec(id || "");
    return m ? parseInt(m[1], 10) : 1;
  };
  const cellNnodes = (cell, sel) => sel.nodes !== undefined ? parseNnodes(sel.nodes) : cell.nnodes || 1;
  const PD_SERVE_PORTS = {
    prefill: 30000,
    decode: 30100
  };
  const overlayEnv = sel => overlayPart(sel, "env");
  const overlayHints = sel => overlayPart(sel, "hints");
  const renderCommand = (cell, sel, envValues, mode = "python") => {
    if (!cell) return "# No command available for the current selection.";
    const modelName = resolveModelName(sel);
    const nnodes = cellNnodes(cell, sel);
    const multinode = nnodes > 1;
    const cellEnv = [...cell.env || [], ...overlayEnv(sel)];
    const flags = overlayCompose(cell.flags, sel);
    if (multinode) {
      const PARALLELISM_ANCHORS = ["--enable-dp-attention", "--dp", "--tp-size", "--tp"];
      let i = -1;
      for (const anchor of PARALLELISM_ANCHORS) {
        i = flags.findIndex(f => f.split(/[\s=]/)[0] === anchor);
        if (i !== -1) break;
      }
      if (i === -1) i = flags.findIndex(f => f.startsWith("--model-path"));
      flags.splice(i + 1, 0, `--nnodes ${nnodes}`, `--node-rank {{NODE_RANK}}`, `--dist-init-addr {{NODE0_IP}}:20000`);
    }
    const pdServePort = PD_SERVE_PORTS[sel.pdMode];
    if (pdServePort !== undefined) {
      for (let j = 0; j < flags.length; j++) {
        if (flags[j].split(/[\s=]/)[0] === "--port") {
          flags[j] = `--port ${pdServePort}`;
        }
      }
    }
    let cmd;
    if (mode === "docker") {
      const di = config.dockerImages || ({});
      const image = di[`${sel.hw}|${sel.quant}|${sel.strategy}`] || di[`${sel.hw}|${sel.quant}`] || di[sel.hw] || "lmsysorg/sglang:dev";
      const dockerRunCommand = typeof config.dockerRunCommand === "function" ? config.dockerRunCommand(sel) : config.dockerRunCommand || "sglang serve";
      const portFlag = flags.find(x => x.split(/[\s=]/)[0] === "--port");
      const servePort = portFlag ? portFlag.slice(("--port").length).trim() : "{{PORT}}";
      const hostNetwork = multinode || typeof config.dockerHostNetworkWhen === "function" && config.dockerHostNetworkWhen(sel, {
        flags,
        env: cellEnv
      });
      const vendorOf = hwId => {
        for (const [vendor, list] of Object.entries(HARDWARE_CATALOG)) {
          if (list.some(h => h.id === hwId)) return vendor;
        }
        const extra = (config.hardware || []).find(h => h.id === hwId);
        return extra && extra.vendor || "nvidia";
      };
      const fabricFlagsOf = hwId => {
        const extra = (config.hardware || []).find(h => h.id === hwId);
        if (extra) return extra.multiNodeDockerFlags || [];
        for (const list of Object.values(HARDWARE_CATALOG)) {
          const hit = list.find(h => h.id === hwId);
          if (hit) return hit.multiNodeDockerFlags || [];
        }
        return [];
      };
      const gpuAccessLines = vendorOf(sel.hw) === "amd" ? ["docker run", "  --device=/dev/kfd --device=/dev/dri", "  --group-add video", "  --cap-add=SYS_PTRACE --security-opt seccomp=unconfined", "  --shm-size 32g"] : ["docker run --gpus all", "  --shm-size 32g"];
      const dockerLines = [...gpuAccessLines, hostNetwork ? "  --network host" : `  -p ${servePort}:${servePort}`, ...multinode ? fabricFlagsOf(sel.hw).map(f => "  " + f) : [], "  -v ~/.cache/huggingface:/root/.cache/huggingface", ...(config.dockerMounts || []).map(mount => `  -v ${mount}`), ...config.placeholders && config.placeholders.HF_TOKEN ? [`  --env "HF_TOKEN={{HF_TOKEN}}"`] : [], ...cellEnv.map(e => `  --env ${e}`), "  --ipc=host", `  ${image}`, `  ${dockerRunCommand}`, ...flags.map(f => "    " + f)];
      cmd = dockerLines.join(" \\\n");
    } else {
      const flagBlock = flags.map(f => "  " + f).join(" \\\n");
      const envBlock = cellEnv.length ? cellEnv.join(" \\\n") + " \\\n" : "";
      cmd = `${envBlock}sglang serve \\\n${flagBlock}`;
    }
    const hintLines = [...overlayHints(sel), ...multinode && config.multiNodeHints && config.multiNodeHints[sel.hw] ? config.multiNodeHints[sel.hw] : []];
    if (hintLines.length) {
      const hint = hintLines.map(line => line.length ? "# " + line : "#").join("\n");
      cmd = `${hint}\n${cmd}`;
    }
    cmd = interpolate(cmd, envValues, modelName);
    if (multinode) {
      const header = `# Multi-node (${nnodes} nodes). Run the same command on every node with:\n` + `#   <node-rank> = 0 on the head node, 1..${nnodes - 1} on the others\n` + `#   <node0-ip>  = IP of the head node (reachable from all others)`;
      cmd = `${header}\n${cmd}`;
    }
    return cmd;
  };
  const ACCURACY_LABELS = config.accuracyLabels || [];
  const renderBenchmarkCard = entry => {
    const pct = entry && entry.latencyPercentile || config.latencyPercentile || "P50";
    const SPEED_LABELS = [["ttft_ms", `TTFT (${pct})`, "ms"], ["tpot_ms", `TPOT (${pct})`, "ms"], ["tokens_per_sec_per_gpu", "throughput per gpu", "tok/s"], ["interactivity", "interactivity", "tokens/s/user", m => m.tpot_ms != null && m.tpot_ms !== 0 ? Math.round(1000 / m.tpot_ms * 10) / 10 : null]];
    const WORKLOAD_KEYS = ["dataset", "isl", "osl", "max_concurrency"];
    const fmt = (val, unit) => {
      if (val === null || val === undefined) return null;
      return `${val}${unit ? " " + unit : ""}`;
    };
    const formatWorkloadParts = (workload, keys) => {
      if (!workload) return "";
      const parts = [];
      if (keys.has("dataset") && workload.dataset) parts.push(workload.dataset);
      if (keys.has("isl") || keys.has("osl")) {
        if (workload.isl != null || workload.osl != null) {
          parts.push(`in/out=${workload.isl != null ? workload.isl : "?"}/${workload.osl != null ? workload.osl : "?"}`);
        }
      }
      if (keys.has("max_concurrency") && workload.max_concurrency != null) {
        parts.push(`max-concurrency=${workload.max_concurrency}`);
      }
      return parts.join(", ");
    };
    const ALWAYS_PER_COLUMN = new Set(["max_concurrency"]);
    const partitionWorkload = measurements => {
      const shared = new Set();
      const differing = new Set();
      for (const k of WORKLOAD_KEYS) {
        const seen = new Set();
        let anyPresent = false;
        for (const m of measurements) {
          const v = m && m.workload ? m.workload[k] : undefined;
          if (v != null) anyPresent = true;
          seen.add(v);
        }
        if (!anyPresent) continue;
        if (ALWAYS_PER_COLUMN.has(k) || seen.size > 1) differing.add(k); else shared.add(k);
      }
      return {
        shared,
        differing
      };
    };
    const renderBenchTable = ({title, sharedText, colHeaders, rows, colCount, legend}) => {
      if (rows.length === 0) return null;
      const showColHeaders = colHeaders.length > 0 && colHeaders.some(h => h !== "");
      return <div style={s.benchBlock}>
          <div style={s.benchBlockTitle}>{title}</div>
          {sharedText && <div style={s.benchWorkload}>{sharedText}</div>}
          <div style={{
        ...s.benchTable,
        gridTemplateColumns: `max-content repeat(${colCount}, minmax(0, 1fr))`
      }}>
            {showColHeaders && <div key="corner" style={s.benchTableCornerHead}></div>}
            {showColHeaders && colHeaders.map((h, i) => <div key={`hdr-${i}`} style={s.benchTableHead}>{h}</div>)}
            {showColHeaders && <div key="sep" style={s.benchTableSeparator}></div>}
            {rows.map(r => [<div key={`lbl-${r.label}`} style={s.benchTableLabel}>{r.label}</div>, ...r.values.map((v, i) => <div key={`val-${r.label}-${i}`} style={v === null ? {
        ...s.benchTableValue,
        ...s.benchTableValueMissing
      } : s.benchTableValue}>
                  {v !== null ? v : "—"}
                </div>)])}
          </div>
          {legend && <div style={s.benchLegend}>
              {(Array.isArray(legend) ? legend : [legend]).map((line, i) => <div key={`legend-${i}`}>{line}</div>)}
            </div>}
        </div>;
    };
    const buildSpeedTable = measurements => {
      if (measurements.length === 0) return null;
      const {shared, differing} = partitionWorkload(measurements);
      const sharedText = formatWorkloadParts(measurements[0] && measurements[0].workload, shared);
      const colHeaders = measurements.map(m => formatWorkloadParts(m && m.workload, differing));
      const rows = SPEED_LABELS.map(tup => {
        const [key, label, unit, compute] = tup;
        const values = measurements.map(m => {
          const raw = compute ? compute(m) : m[key];
          return fmt(raw, unit);
        });
        return {
          label,
          values
        };
      });
      return {
        title: "Speed",
        sharedText,
        colHeaders,
        rows,
        colCount: measurements.length,
        legend: [`throughput per gpu = (input+output tokens)/elapsed/GPU`, `interactivity = 1000/TPOT(ms) (tokens/s/user)`]
      };
    };
    const buildAccuracyTable = accuracy => {
      if (!accuracy) return null;
      const rows = ACCURACY_LABELS.map(([key, label, unit]) => {
        const v = fmt(accuracy[key], unit);
        if (v === null) return null;
        return {
          label,
          values: [v]
        };
      }).filter(r => r !== null);
      if (rows.length === 0) return null;
      return {
        title: "Accuracy",
        sharedText: null,
        colHeaders: [],
        rows,
        colCount: 1
      };
    };
    const accuracy = effectiveAccuracy(entry, sel);
    const isEmpty = benchmarkIsEmpty(entry, accuracy);
    const measurements = !isEmpty ? normalizeSpeed(entry && entry.speed) : [];
    const accuracyTable = !isEmpty ? buildAccuracyTable(accuracy) : null;
    const speedTable = !isEmpty ? buildSpeedTable(measurements) : null;
    const hasBenchCmds = !isEmpty && buildBenchCommands(entry, sel) !== null;
    return <div style={s.benchCard}>
        <div style={s.benchHeader}>
          <div style={s.benchTitle}>Benchmark</div>
          <div style={s.benchHeaderRight}>
            {!isEmpty && entry && entry.sglang_version && <div style={s.benchVersion}>measured on sglang <code>{entry.sglang_version}</code></div>}
            {hasBenchCmds && <button style={s.iconButton} onClick={() => setModal("bench")}>⚡ Reproduce</button>}
          </div>
        </div>
        {isEmpty ? <div style={s.benchEmpty}>
            Benchmark data pending for this combination — submit yours via the Playground's Submit ↗ button.
          </div> : <>
            {accuracyTable && renderBenchTable(accuracyTable)}
            {speedTable && renderBenchTable(speedTable)}
            {entry && entry.notes && <div style={s.benchNotes}>{entry.notes}</div>}
          </>}
      </div>;
  };
  const buildBenchCommands = (entry, sel) => {
    const bc = config.benchmarkCommands;
    if (!bc) return null;
    const acc = effectiveAccuracy(entry, sel);
    const accuracy = [];
    if (bc.accuracy) {
      for (const [key, label] of ACCURACY_LABELS) {
        if (acc[key] == null) continue;
        const tmpl = bc.accuracy[key];
        const resolved = typeof tmpl === "string" ? tmpl : tmpl && tmpl[sel.variant] || null;
        if (resolved) accuracy.push({
          key,
          label,
          template: resolved
        });
      }
    }
    let speed = null;
    if (bc.speed && entry) {
      const ms = normalizeSpeed(entry.speed).filter(m => m && m.workload && m.workload.max_concurrency != null);
      const concurrencies = [...new Set(ms.map(m => m.workload.max_concurrency))].sort((a, b) => a - b);
      if (concurrencies.length) {
        speed = {
          template: bc.speed,
          concurrencies,
          workload: ms[0].workload,
          numPromptsOf: c => {
            const m = ms.find(x => x.workload.max_concurrency === c);
            if (m && m.workload.num_prompts != null) return m.workload.num_prompts;
            const tbl = bc.numPromptsByConc;
            if (tbl && tbl[c] != null) return tbl[c];
            return Math.max(c * 2, 200);
          }
        };
      }
    }
    if (accuracy.length === 0 && !speed) return null;
    return {
      accuracy,
      speed
    };
  };
  const buildHardwareGroups = () => {
    const supported = new Set(config.supportedHardware);
    const catalog = {};
    for (const [vendor, list] of Object.entries(HARDWARE_CATALOG)) catalog[vendor] = [...list];
    for (const hw of config.hardware || []) {
      const vendor = hw.vendor || "nvidia";
      const list = catalog[vendor] || (catalog[vendor] = []);
      const entry = {
        id: hw.id,
        label: hw.label,
        vram: hw.vram
      };
      const i = list.findIndex(x => x.id === hw.id);
      if (i >= 0) list[i] = entry; else list.push(entry);
    }
    const groups = [];
    for (const [vendor, list] of Object.entries(catalog)) {
      const items = list.filter(hw => supported.has(hw.id)).map(hw => ({
        id: hw.id,
        label: hw.label,
        subtitle: hw.vram
      }));
      if (items.length) groups.push({
        label: vendor.toUpperCase(),
        items
      });
    }
    if (config.groupHardware === false) {
      return [{
        label: null,
        items: groups.flatMap(group => group.items)
      }];
    }
    return groups;
  };
  const initialSelectionFromCells = () => {
    const first = config.cells[0];
    const sel = Object.fromEntries(DIMENSIONS.map(d => [d, first ? first.match[d] : ""]));
    for (const spec of overlayDimSpecs) {
      const opts = spec.options || [];
      sel[spec.id] = (spec.default ?? (opts[0] && opts[0].id)) ?? "";
    }
    return sel;
  };
  const placeholderDefaults = schema => {
    const out = {};
    for (const [k, v] of Object.entries(schema || ({}))) out[k] = v.default ?? "";
    return out;
  };
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => {
      const html = document.documentElement;
      setIsDark(html.classList.contains("dark") || html.getAttribute("data-theme") === "dark" || html.style.colorScheme === "dark");
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    });
    return () => observer.disconnect();
  }, []);
  const STORAGE_KEY = "sglang-deploy-env";
  const [env, setEnv] = useState(() => placeholderDefaults(config.placeholders));
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setEnv({
          ...placeholderDefaults(config.placeholders),
          ...parsed
        });
      }
    } catch {}
  }, []);
  const saveEnv = next => {
    setEnv(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };
  const [sel, setSel] = useState(() => initialSelectionFromCells());
  const INTERNAL_HASH_STATE_KEY = "__sglangDeployInternalHash";
  const DEPLOYMENT_COMPONENT_ID = "deployment-configurator";
  useEffect(() => {
    const hydrate = () => {
      const raw = window.location.hash.replace(/^#/, "");
      if (!raw) return;
      const params = new URLSearchParams(raw);
      const initial = initialSelectionFromCells();
      const parsed = {
        ...initial
      };
      let touched = false;
      params.forEach((value, key) => {
        if ((key in parsed)) {
          parsed[key] = value;
          touched = true;
        }
      });
      if (!touched) return;
      setSel(validateSelection(config.cells, parsed));
      const historyState = window.history.state;
      const isInternalHash = historyState && typeof historyState === "object" && historyState[INTERNAL_HASH_STATE_KEY] === `#${raw}`;
      if (isInternalHash) return;
      const el = document.getElementById(DEPLOYMENT_COMPONENT_ID);
      if (el) el.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    };
    hydrate();
    window.addEventListener("hashchange", hydrate);
    return () => window.removeEventListener("hashchange", hydrate);
  }, []);
  useEffect(() => {
    const target = "#" + new URLSearchParams(sel).toString();
    if (window.location.hash !== target) {
      const historyState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      window.history.replaceState({
        ...historyState,
        [INTERNAL_HASH_STATE_KEY]: target
      }, "", target);
    }
    window.dispatchEvent(new CustomEvent("sglang-deploy-sel", {
      detail: sel
    }));
  }, [sel]);
  const [modal, setModal] = useState(null);
  useEffect(() => {
    if (modal === null) return;
    const onKey = e => {
      if (e.key === "Escape") setModal(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modal]);
  const [copied, setCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);
  const [envDraft, setEnvDraft] = useState(env);
  const [benchConc, setBenchConc] = useState(null);
  const [benchAcc, setBenchAcc] = useState(null);
  const [benchCopied, setBenchCopied] = useState(null);
  const configuredRunModes = typeof config.runModes === "function" ? config.runModes(sel) : config.runModes;
  const runModes = configuredRunModes || ["python", "docker"];
  const [runMode, setRunMode] = useState(runModes[0]);
  const hasRunMode = runModes.includes(runMode);
  const fallbackRunMode = runModes[0];
  const activeRunMode = hasRunMode ? runMode : fallbackRunMode;
  useEffect(() => {
    if (!hasRunMode) setRunMode(fallbackRunMode);
  }, [hasRunMode, fallbackRunMode]);
  useEffect(() => {
    if (modal === "env") setEnvDraft(env);
  }, [modal, env]);
  const [mambaRatio, setMambaRatio] = useState(null);
  useEffect(() => {
    const onRatio = e => setMambaRatio(e.detail && (e.detail.baseRatio || e.detail.ratio) || null);
    window.addEventListener("sglang-k3-mamba-ratio", onRatio);
    return () => window.removeEventListener("sglang-k3-mamba-ratio", onRatio);
  }, []);
  const s = makeStyles(isDark);
  const cell = findCell(config.cells, sel);
  const verifyStatus = cellVerifyStatus(cell);
  const cellWithRatio = (() => {
    if (!cell || !mambaRatio) return cell;
    if (cell.flags.some(f => f.startsWith("--mamba-full-memory-ratio"))) return cell;
    const flags = [...cell.flags];
    const line = `--mamba-full-memory-ratio ${mambaRatio}`;
    const i = flags.findIndex(f => f.startsWith("--host"));
    if (i >= 0) flags.splice(i, 0, line); else flags.push(line);
    return {
      ...cell,
      flags
    };
  })();
  const command = renderCommand(cellWithRatio, sel, env, activeRunMode);
  const effFlags = cell ? overlayCompose(cell.flags, sel) : [];
  const specAlgoFlag = effFlags.find(f => f.split(/[\s=]/)[0] === "--speculative-algorithm");
  const specMrrFlag = effFlags.find(f => f.split(/[\s=]/)[0] === "--max-running-requests");
  const mtpHint = !!specAlgoFlag && !specMrrFlag;
  const specPinnedHint = !!specAlgoFlag && !!specMrrFlag;
  const specMrrValue = specMrrFlag ? specMrrFlag.split(/[\s=]/).filter(Boolean)[1] || "" : "";
  const SPEC_ALGO_LABEL = {
    EAGLE: "MTP",
    EAGLE3: "MTP",
    FROZEN_KV_MTP: "MTP",
    DSPARK: "DSpark",
    DFLASH: "DFlash",
    NGRAM: "N-gram",
    STANDALONE: "standalone draft"
  };
  const specAlgoName = (() => {
    if (!specAlgoFlag) return "MTP";
    const v = specAlgoFlag.split(/[\s=]/).filter(Boolean)[1] || "";
    return SPEC_ALGO_LABEL[v.toUpperCase()] || v || "MTP";
  })();
  const renderWarn = text => {
    const out = [];
    const re = /\[([^\]]+)\]\(#([^)]+)\)/g;
    let last = 0;
    for (let m; m = re.exec(text); last = m.index + m[0].length) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const anchor = m[2];
      out.push(<button key={m.index} type="button" onClick={() => {
        const el = document.getElementById(anchor);
        if (el) el.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }} style={{
        background: "transparent",
        border: "none",
        padding: 0,
        color: isDark ? "#FDBA74" : "#C2410C",
        cursor: "pointer",
        font: "inherit",
        fontWeight: 600,
        textDecoration: "underline",
        textUnderlineOffset: "2px"
      }}>
          {m[1]}
        </button>);
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };
  const modelName = resolveModelName(sel);
  const curlTemplate = typeof config.curl === "function" ? config.curl(sel, cell) : config.curl;
  const curlText = interpolate(curlTemplate || "", env, modelName);
  const hwGroups = buildHardwareGroups();
  const benchEntry = benchmarks ? findBenchmark(benchmarks, sel) : null;
  const isOverlayDim = dim => overlayDimSpecs.some(d => d.id === dim);
  const findOption = (dim, value) => {
    const spec = [...matchDimSpecs, ...overlayDimSpecs].find(d => d.id === dim);
    return spec && (spec.options || []).find(o => o.id === value);
  };
  const isEnabled = (dim, value) => {
    const opt = findOption(dim, value);
    if (opt && optionDisabled(opt, sel)) return false;
    return isOverlayDim(dim) || isOptionAvailable(config.cells, sel, dim, value);
  };
  const reseatHiddenPicks = next => {
    let out = next;
    for (const spec of [...matchDimSpecs, ...overlayDimSpecs]) {
      const opts = visibleOptions(spec, out).filter(o => !optionDisabled(o, out));
      if (!opts.length) continue;
      if (!opts.some(o => o.id === out[spec.id])) {
        out = {
          ...out,
          [spec.id]: opts[0].id
        };
      }
    }
    return out;
  };
  const handleSelect = (dim, value) => {
    setSel(prev => reseatHiddenPicks(isOverlayDim(dim) ? {
      ...prev,
      [dim]: value
    } : snapToValidCell(config.cells, prev, dim, value)));
  };
  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const copyCurl = () => {
    navigator.clipboard.writeText(curlText);
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 1200);
  };
  const copyBench = (key, text) => {
    navigator.clipboard.writeText(text);
    setBenchCopied(key);
    setTimeout(() => setBenchCopied(null), 1200);
  };
  const placeholderGroups = (() => {
    const out = {
      command: [],
      curl: []
    };
    for (const [key, meta] of Object.entries(config.placeholders || ({}))) {
      (out[meta.target] || (out[meta.target] = [])).push({
        key,
        ...meta
      });
    }
    return out;
  })();
  const renderButton = (item, dim, selectedId) => {
    const checked = selectedId === item.id;
    const disabled = !isEnabled(dim, item.id);
    return <label key={item.id} style={{
      ...s.labelBase,
      ...checked ? s.checked : {},
      ...disabled ? s.disabled : {}
    }} title={disabled ? item.disableReason || "Not supported for current selection" : ""} onClick={e => {
      if (disabled) {
        e.preventDefault();
        return;
      }
      handleSelect(dim, item.id);
    }}>
        <input type="radio" checked={checked} disabled={disabled} readOnly style={{
      display: "none"
    }} />
        <span>{item.label}</span>
        {item.subtitle && <small style={{
      ...s.subtitle,
      color: checked ? "rgba(255,255,255,0.85)" : "inherit"
    }}>
            {item.subtitle}
          </small>}
      </label>;
  };
  const renderFlatSection = (title, options, dim, selectedId) => <div style={s.card}>
      <div style={s.title}>{title}</div>
      <div style={s.itemsGrid(options.length)}>
        {options.map(item => renderButton(item, dim, selectedId))}
      </div>
    </div>;
  const maxHwCols = Math.max(...hwGroups.map(x => x.items.length));
  return <div id={DEPLOYMENT_COMPONENT_ID} style={{
    ...s.container,
    scrollMarginTop: "104px"
  }} className="not-prose">
      {}
      <div style={s.cardColumn}>
        <div style={{
    ...s.title,
    marginBottom: "2px"
  }}>Hardware Platform</div>
        {hwGroups.map(g => <div key={g.label || "hardware"} style={s.vendorRow}>
            {g.label && <div style={s.vendorLabel}>{g.label}</div>}
            <div style={s.itemsGrid(maxHwCols)}>
              {g.items.map(item => renderButton(item, "hw", sel.hw))}
              {Array.from({
    length: maxHwCols - g.items.length
  }).map((_, i) => <div key={`pad-${i}`} />)}
            </div>
          </div>)}
      </div>

      {matchDimSpecs.filter(d => rowVisible(d, sel)).map(d => <div key={d.id}>
            {renderFlatSection(d.title, visibleOptions(d, sel), d.id, sel[d.id])}
          </div>)}
      {overlayDimSpecs.filter(d => rowVisible(d, sel)).map(d => <div key={d.id}>
            {renderFlatSection(d.title, visibleOptions(d, sel), d.id, sel[d.id])}
          </div>)}

      {}
      <div style={s.card}>
        <div style={s.title}>Command:</div>
        <div style={s.commandWrap}>
          {cell && cell.redirect ? cell.warn && <div style={s.mtpWarn}>⚠️ {renderWarn(cell.warn)}</div> : <>
            <div style={s.commandHeader}>
              <div style={s.headerLeft}>
                <div style={s.badge(verifyStatus)}>
                  <span style={s.badgeDot(verifyStatus)} />
                  {VERIFY_LABEL[verifyStatus]}
                </div>
                <div style={s.runModeWrap} role="tablist" aria-label="Output format">
                  {runModes.map((mode, index) => <span key={mode} style={{
    ...index === runModes.length - 1 ? s.runModeChipLast(activeRunMode === mode) : s.runModeChip(activeRunMode === mode),
    ...runModes.length === 1 ? {
      borderRadius: 7
    } : {}
  }} onClick={() => setRunMode(mode)} role="tab" aria-selected={activeRunMode === mode}>
                      {mode === "docker" ? "Docker" : "Python"}
                    </span>)}
                </div>
              </div>
              <div style={s.iconRow}>
                <button style={s.iconButton} onClick={handleCopy}>
                  {copied ? "✓ Copied" : "⧉ Copy"}
                </button>
                <button style={s.iconButton} onClick={() => setModal("curl")}>$ cURL</button>
                <button style={s.iconButton} onClick={() => setModal("env")}>⚙ Env</button>
              </div>
            </div>
            <pre style={s.commandPre}>{command}</pre>
            {cell && cell.warn && <div style={s.mtpWarn}>⚠️ {renderWarn(cell.warn)}</div>}
            {mtpHint && <div style={s.mtpWarn}>
                ⚠️ Speculative decoding ({specAlgoName}) is on — SGLang resets <code>--max-running-requests</code> to <strong>48</strong> when it isn't set. Add <code>--max-running-requests &lt;N&gt;</code> sized for your target concurrency.
              </div>}
            {specPinnedHint && <div style={s.mtpWarn}>
                ℹ️ Speculative decoding ({specAlgoName}) is on and this recipe pins <code>--max-running-requests</code> to <strong>{specMrrValue}</strong>. Adjust it to match your target concurrency — if you remove the flag, SGLang falls back to <strong>48</strong>.
              </div>}
          </>}
        </div>
      </div>

      {}
      {benchmarks && cell && renderBenchmarkCard(benchEntry)}

      {}
      {config.showPlaygroundLink !== false && <div style={{
    padding: "6px 12px",
    fontSize: "12px",
    color: isDark ? "#9ca3af" : "#6b7280",
    display: "flex",
    alignItems: "center",
    gap: "6px"
  }}>
          <span>Need to go beyond the verified matrix?</span>
          <button type="button" onClick={() => {
    const el = document.getElementById("playground");
    if (el) el.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }} style={{
    background: "transparent",
    border: "none",
    padding: 0,
    color: isDark ? "#FDBA74" : "#C2410C",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: "2px"
  }}>
            Open the Playground →
          </button>
        </div>}

      {}
      {modal === "curl" && <div style={s.modalBackdrop} onClick={() => setModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>cURL example</div>
              <button style={s.modalCloseBtn} onClick={() => setModal(null)} aria-label="Close">×</button>
            </div>
            <div style={s.commandWrap}>
              <div style={s.commandHeader}>
                <div style={{
    fontSize: 11,
    opacity: 0.7
  }}>
                  Model: <code>{modelName || "(unresolved)"}</code>
                </div>
                <button style={s.iconButton} onClick={copyCurl}>
                  {curlCopied ? "✓ Copied" : "⧉ Copy"}
                </button>
              </div>
              <pre style={s.commandPre}>{curlText}</pre>
            </div>
            <p style={{
    fontSize: 11,
    opacity: 0.7,
    marginTop: 8
  }}>
              Edit <code>CURL_HOST</code> / <code>CURL_PORT</code> in the Env panel.
            </p>
          </div>
        </div>}

      {}
      {modal === "env" && <div style={s.modalBackdrop} onClick={() => setModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>Env / placeholder values</div>
              <button style={s.modalCloseBtn} onClick={() => setModal(null)} aria-label="Close">×</button>
            </div>
            {placeholderGroups.curl.length > 0 && <div>
                <div style={s.sectionHeading}>cURL placeholders</div>
                {placeholderGroups.curl.map(({key, label}) => <div key={key} style={s.formField}>
                    <label style={s.formLabel}>
                      {label} <code style={{
    opacity: 0.6
  }}>{`{{${key}}}`}</code>
                    </label>
                    <input style={s.formInput} value={envDraft[key] ?? ""} onChange={e => setEnvDraft({
    ...envDraft,
    [key]: e.target.value
  })} />
                  </div>)}
              </div>}
            {placeholderGroups.command.length > 0 && <div>
                <div style={s.sectionHeading}>Command placeholders</div>
                {placeholderGroups.command.map(({key, label}) => <div key={key} style={s.formField}>
                    <label style={s.formLabel}>
                      {label} <code style={{
    opacity: 0.6
  }}>{`{{${key}}}`}</code>
                    </label>
                    <input style={s.formInput} value={envDraft[key] ?? ""} onChange={e => setEnvDraft({
    ...envDraft,
    [key]: e.target.value
  })} />
                  </div>)}
              </div>}
            <div style={{
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16
  }}>
              <button style={{
    ...s.iconButton,
    padding: "6px 14px"
  }} onClick={() => setModal(null)}>Cancel</button>
              <button style={s.primaryBtn} onClick={() => {
    saveEnv(envDraft);
    setModal(null);
  }}>Save</button>
            </div>
            <p style={{
    fontSize: 11,
    opacity: 0.7,
    marginTop: 10
  }}>
              Values persist in localStorage and are reused the next time you visit any cookbook.
            </p>
          </div>
        </div>}

      {}
      {modal === "bench" && benchEntry && (() => {
    const bc = buildBenchCommands(benchEntry, sel);
    if (!bc) return null;
    const selSummary = `${sel.hw.toUpperCase()} · ${sel.variant} · ${sel.quant.toUpperCase()} · ${sel.strategy} · ${sel.nodes}`;
    let selConc = null;
    let speedCmd = null;
    if (bc.speed) {
      selConc = bc.speed.concurrencies.includes(benchConc) ? benchConc : bc.speed.concurrencies[0];
      const w = bc.speed.workload;
      speedCmd = interpolate(bc.speed.template, {
        ...env,
        DATASET: w.dataset,
        ISL: w.isl,
        OSL: w.osl,
        MAX_CONCURRENCY: selConc,
        NUM_PROMPTS: bc.speed.numPromptsOf(selConc)
      }, modelName);
    }
    let selAcc = null;
    let accCmd = null;
    if (bc.accuracy.length > 0) {
      selAcc = bc.accuracy.find(a => a.key === benchAcc) || bc.accuracy[0];
      accCmd = interpolate(selAcc.template, env, modelName);
    }
    return <div style={s.modalBackdrop} onClick={() => setModal(null)}>
            <div style={s.modalBox} onClick={e => e.stopPropagation()}>
              <div style={s.modalHeader}>
                <div style={s.modalTitle}>Benchmark commands</div>
                <button style={s.modalCloseBtn} onClick={() => setModal(null)} aria-label="Close">×</button>
              </div>
              <p style={{
      fontSize: 11,
      opacity: 0.7,
      margin: "0 0 12px"
    }}>
                For <code>{selSummary}</code>. Start the server with the Deploy command above, then run these against it.
              </p>

              {selAcc && <div>
                  <div style={s.sectionHeading}>Accuracy</div>
                  {bc.accuracy.length > 1 && <div style={s.benchChipRow}>
                      <span style={{
      fontSize: 11,
      opacity: 0.7
    }}>benchmark:</span>
                      {bc.accuracy.map(a => <button key={a.key} style={{
      ...s.benchChip,
      ...a.key === selAcc.key ? s.benchChipActive : {}
    }} onClick={() => setBenchAcc(a.key)}>
                          {a.label}
                        </button>)}
                    </div>}
                  <div style={{
      ...s.commandWrap,
      marginBottom: 6
    }}>
                    <div style={s.commandHeader}>
                      <div style={{
      fontSize: 11,
      opacity: 0.7
    }}>{selAcc.label}</div>
                      <button style={s.iconButton} onClick={() => copyBench("acc", accCmd)}>
                        {benchCopied === "acc" ? "✓ Copied" : "⧉ Copy"}
                      </button>
                    </div>
                    <pre style={s.commandPre}>{accCmd}</pre>
                  </div>
                  {bc.accuracy.length > 1 && <p style={{
      fontSize: 11,
      opacity: 0.7,
      margin: "0 0 4px"
    }}>
                      Switch the benchmark chip to see each eval's command.
                    </p>}
                </div>}

              {bc.speed && <div>
                  <div style={s.sectionHeading}>Speed</div>
                  {bc.speed.concurrencies.length > 1 && <div style={s.benchChipRow}>
                      <span style={{
      fontSize: 11,
      opacity: 0.7
    }}>max-concurrency:</span>
                      {bc.speed.concurrencies.map(c => <button key={c} style={{
      ...s.benchChip,
      ...c === selConc ? s.benchChipActive : {}
    }} onClick={() => setBenchConc(c)}>
                          {c}
                        </button>)}
                    </div>}
                  <div style={{
      ...s.commandWrap,
      marginBottom: 6
    }}>
                    <div style={s.commandHeader}>
                      <div style={{
      fontSize: 11,
      opacity: 0.7
    }}>max-concurrency = {selConc}</div>
                      <button style={s.iconButton} onClick={() => copyBench("speed", speedCmd)}>
                        {benchCopied === "speed" ? "✓ Copied" : "⧉ Copy"}
                      </button>
                    </div>
                    <pre style={s.commandPre}>{speedCmd}</pre>
                  </div>
                  <p style={{
      fontSize: 11,
      opacity: 0.7,
      margin: "0 0 4px"
    }}>
                    One command — switch the concurrency chip (or edit <code>--max-concurrency</code>) to reproduce each Speed column.
                  </p>
                </div>}

              <p style={{
      fontSize: 11,
      opacity: 0.7,
      marginTop: 12
    }}>
                Edit <code>CURL_HOST</code> / <code>CURL_PORT</code> in the Env panel.
              </p>
            </div>
          </div>;
  })()}
    </div>;
};

## 1. Model introduction

[MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3) generates a video and a synchronized stereo audio track in one request. SGLang Diffusion provides a native pipeline for the three public task profiles, split across the released FL2VA (First-and-Last-Frame-to-Video-and-Audio) and Ref2VA (Reference-to-Video-and-Audio) checkpoint partitions:

| Task                                | `task` value | Conditioning                       |
| ----------------------------------- | ------------ | ---------------------------------- |
| Text to video and audio             | `t2va`       | Text prompt only                   |
| First/last frame to video and audio | `fl2va`      | First frame, last frame, or both   |
| Reference to video and audio        | `ref2va`     | Image, video, and audio references |

Video-to-video (V2V) is a supported `ref2va` use case, not a fourth task
value. Run the `Ref2VA` partition and provide a video reference in
`conditions`.

Use the selected Hub's root model ID: `MiniMaxAI/MiniMax-H3` on Hugging Face
or `MiniMax/MiniMax-H3` on ModelScope. Select the checkpoint variant with
`--model-variant`: `fl2va` serves both `t2va` and `fl2va`, while `ref2va`
serves reference-conditioned requests. SGLang owns the checkpoint-directory
mapping; do not point `--model-path` at a manually downloaded subdirectory.

<Warning>
  Review the license and usage terms in the MiniMax-H3 model card before production or commercial use. SGLang support does not grant additional model usage rights.
</Warning>

## 2. Installation

Install SGLang with the diffusion dependencies:

```bash Command theme={null}
uv pip install "sglang[diffusion]" --prerelease=allow
```

For platform-specific setup, see the [SGLang Diffusion installation guide](/docs/sglang-diffusion/installation).

## 3. Serve MiniMax-H3

Use the interactive selector to choose a hardware platform, deployment profile,
one of the two checkpoint partitions, a request mode, and deployment features.
It generates Python and, where available, Docker launch forms. AMD selections
use the Python form until an H3-capable ROCm image is validated. The **\$ cURL**
button follows the selected request mode and switches the payload across
text-only, all three first/last-frame signatures, and the image/audio/video
reference combinations listed below.
Set **Outputs per prompt** in the picker’s **Env** panel to generate more than
one output without mixing request sampling controls into the deployment
matrix.

The Docker form does not assume the base SGLang image contains optional
diffusion dependencies. It installs the platform-specific diffusion extra from
the source bundled in the image before starting the server. Set **Host media
directory** in the **Env** panel for FL2VA, V2V, or Ref2VA; the picker mounts
that directory read-only at `/data/minimax-h3` inside the container.

Every hardware/topology cell in this picker has completed a real request on
that exact GPU model. Approximate load-time features such as online
quantization are called out separately in the generated command. Sampling
behavior such as Cache-DiT is documented separately below.

**Deployment Profile** exposes resident and FSDP placement on B200, B300,
H200, and H100. Resident is the latency-oriented default; FSDP reduces DiT
weight residency at the cost of per-block parameter collectives. On H200 it
also selects the verified 2-node cross-node topology. **Online
Quantization** appears only on B200 and B300. AMD keeps its resident AITER
recipe, while RTX 5090 uses its dedicated layerwise-offload profile. A
single 24 GB card (RTX 4090) uses the same offload knobs plus online
`kitchen_int8`; that recipe is documented below rather than in the picker.

<Deployment config={config} />

<Note>
  The ready-to-run request template lives behind the **\$ cURL** button in the
  picker above. It regenerates as you change the selection, so the payload it
  shows always matches the serve command next to it.
</Note>

The selector uses the verified Hugging Face ID. To use ModelScope through the
same normal `sglang serve` path, prefix the copied command with
`SGLANG_USE_MODELSCOPE=true` and replace the model path with
`MiniMax/MiniMax-H3`; keep its selected variant and topology flags unchanged.

For a four-card H200 host, keep the full BF16/FP32 model resident by default.
The model fits without FSDP, so this path avoids the per-block parameter
all-gathers of the memory-oriented FSDP profile:

```bash 4×H200 resident theme={null}
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --num-gpus 4 \
  --ulysses-degree 4 \
  --performance-mode speed \
  --port 30010
```

Pure Ulysses4 is also the faster measured topology on H200, not just a
capacity default. The 4×H100 TP2 + Ulysses2 recipe below fits on 141 GB H200
cards, but it replaces the Ulysses all-to-all exchange with two per-block
tensor-parallel all-reduces and measured slower end-to-end, at about 30 GB
lower peak memory per GPU. See the **H200 topology comparison** in the
Benchmarks section for the measured numbers; treat TP2 + Ulysses2 on H200 as
a deliberate memory trade, not a latency default.

For 4×H100 80 GB, balance the large packed activation with resident weight
sharding. TP2 + Ulysses2 was the fastest measured lossless topology while the
Qwen encoder still folds across all four GPUs:

```bash 4×H100 fastest theme={null}
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --num-gpus 4 \
  --tp-size 2 \
  --ulysses-degree 2 \
  --performance-mode speed \
  --port 30010
```

Pure Ulysses4 could not keep the full pipeline resident on 80 GB H100s. Use
`--tp-size 4 --ulysses-degree 1` when lower resident memory matters more than
the last few percent of latency. FSDP remains a verified capacity option, but
its per-block weight all-gathers do not make it the H100 speed default:

```bash 4×H100 FSDP capacity theme={null}
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --num-gpus 4 \
  --ulysses-degree 4 \
  --performance-mode speed \
  --use-fsdp-inference true \
  --port 30010
```

For a two-card RTX 5090 host, use TP2 and keep 20 DiT blocks
resident. Layerwise placement is lossless: it changes parameter placement and
transfer scheduling, not the BF16/FP32 denoising or VAE math. This is the
fastest measured 32 GB operating point:

```bash 2×RTX 5090 fastest lossless theme={null}
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --num-gpus 2 \
  --tp-size 2 \
  --ulysses-degree 1 \
  --performance-mode memory \
  --layerwise-offload-components dit,text_encoder,vae \
  --dit-offload-prefetch-size 1 \
  --dit-layerwise-resident-layers 20 \
  --enable-torch-compile false \
  --port 30010
```

The DiT residency and prefetch knobs apply only to the repeatedly executed DiT
blocks. The text encoder and the video VAE decoder blocks use one-layer
prefetch with zero resident layers. The video VAE encoder stays resident
because its indexed down blocks cannot host executable layerwise hooks; the
roughly 577 MiB audio VAE also stays resident because offloading it only adds
transfer overhead. This exact recipe was validated on
2× RTX 5090 (32 GB each) and a 377 GiB host; use a 384 GiB-class machine. The
latency and memory comparison is collected in the benchmark section below.

For a single 24 GB consumer card (RTX 4090), stream the DiT and text encoder
and quantize DiT linear layers online with `kitchen_int8`. Keep `vae` out of
`--layerwise-offload-components`: putting the VAE decoder in layerwise
offload re-streams about 9 GiB on each of 167 decode tiles. Default
attention stays `fa` (exact). Approximate backends are opt-in; see
[Attention Backends](/docs/sglang-diffusion/attention_backends#sage-then-sol-hybrid).
Install `comfy-kitchen` first (`pip install comfy-kitchen`).

```bash 1×RTX 4090 24GB theme={null}
sglang generate \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --quantization kitchen_int8 \
  --attention-backend fa \
  --performance-mode memory \
  --layerwise-offload-components dit,text_encoder \
  --dit-offload-prefetch-size 1 \
  --dit-layerwise-resident-layers 0 \
  --enable-torch-compile false \
  --prompt "A cat walking on a sunny beach, gentle waves." \
  --save-output
```

The same flags work on `sglang serve`. Drop `--quantization` for the BF16
baseline; everything else stays identical. GPU peak stays about 18 GB
either way because streaming offload is set by the offload buffers and VAE
decode, not the weight dtype.

The first launch downloads the model through the selected Hub. If the Hugging
Face repository requires authentication, export a Hugging Face token in the
server environment.

For MiniMax-H3, `--performance-mode speed` deliberately keeps the DiT eager. The current `torch.compile` path changes the model's numerical output, so it is not enabled implicitly by any recommended lossless preset. An explicit `--enable-torch-compile true` remains available for controlled experiments, but it should not be used to generate consistency ground truth.

### Advanced: precomputed AdaLN cache

The [model card](https://huggingface.co/MiniMaxAI/MiniMax-H3) notes that about
13B H3 parameters are AdaLN branches whose outputs can be precomputed for
inference. The public base checkpoint contains the original branches, not a
ready-to-use cache. SGLang therefore keeps the standard path as the default.

<Warning>
  This is an experimental deployment path. It is intentionally disabled unless
  you provide an explicitly generated cache; end-to-end numerical and peak-memory
  validation remains required before using it in production.
</Warning>

When an inference-only deployment has a fixed sampling schedule, build a cache
from the already materialized transformer directory on CUDA, then pass it to
the usual `sglang serve` command. This does not alter the denoising formula:
the cache stores the BF16 outputs of the original AdaLN linears.

```bash Command theme={null}
python -m sglang.multimodal_gen.tools.build_minimax_h3_adaln_cache \
  --transformer-path "$TRANSFORMER_PATH" \
  --model-variant fl2va \
  --mode t2va \
  --num-inference-steps 50 \
  --flow-shift 12 \
  --audio-flow-shift 3 \
  --output /models/minimax-h3-fl2va-adaln-50step.safetensors

sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --minimax-h3-adaln-cache-path /models/minimax-h3-fl2va-adaln-50step.safetensors \
  --num-gpus 4 \
  --tp-size 2 \
  --ulysses-degree 2 \
  --port 30010
```

`$TRANSFORMER_PATH` is the `FL2VA/transformer` or `Ref2VA/transformer`
directory in the normal SGLang/Hugging Face snapshot; the builder never
downloads a second copy. A cache only covers the scheduler settings used to
create it, including its mode, step count, flow shifts, and condition noise
values. SGLang rejects a request outside that coverage instead of silently
changing conditioning. Cache mode supports the matching unquantized checkpoint
only.

## 4. Generate video and audio

MiniMax-H3 uses the asynchronous OpenAI-compatible video endpoint. Choose a
generation mode below, submit a job, poll its status, and then download the
completed MP4.

<Tabs>
  <Tab title="T2VA">
    MiniMax-H3 supports output durations from 4 through 15 seconds, inclusive. The
    following request keeps the verified 5-second profile at a 768-pixel short
    edge. MiniMax-H3 resolves the aligned output canvas and frame count from
    `target`.

    ```bash Command theme={null}
    video_id=$(
      curl -sS -X POST http://127.0.0.1:30010/v1/videos \
        -H "Content-Type: application/json" \
        -d '{
          "model": "MiniMaxAI/MiniMax-H3",
          "prompt": "At night, while their owner sleeps in a bedroom, three cats march in loudly playing tiny brass instruments, then abruptly file out.",
          "seconds": 5,
          "task": "t2va",
          "conditions": [],
          "target": {
            "short_edge": 768,
            "aspect_ratio": "16:9",
            "duration_seconds": 5.0
          },
          "num_outputs_per_prompt": 1,
          "num_inference_steps": 50,
          "flow_shift": 12.0,
          "audio_flow_shift": 3.0,
          "seed": 1101
        }' |
        jq -r '.id'
    )

    while true; do
      status=$(curl -sS "http://127.0.0.1:30010/v1/videos/${video_id}" | jq -r '.status')
      [ "$status" = "completed" ] && break
      [ "$status" = "failed" ] && exit 1
      sleep 1
    done

    curl -sS -L "http://127.0.0.1:30010/v1/videos/${video_id}/content" \
      -o minimax-h3-t2va.mp4
    ```

    The output contract is an MP4 containing H.264 video at 24 fps and one AAC stereo audio stream at 32 kHz.
  </Tab>

  <Tab title="FL2VA">
    For `fl2va`, provide one or two image conditions with role `keyframe`. The supported frame-index sets are `[0]`, `[-1]`, and `[0, -1]`.

    The following request uses one server-local first frame. Use
    `frame_index: -1` for a last frame, or include both entries for first-and-last
    conditioning.

    Choose FL2VA when the supplied image should be the actual first or last frame
    of the generated clip. Use image-based Ref2VA instead when the image should
    guide identity, style, or composition without being preserved as an endpoint;
    Ref2VA may recompose or crop the reference.

    ```bash Command theme={null}
    curl -sS -X POST http://127.0.0.1:30010/v1/videos \
      -H "Content-Type: application/json" \
      -d '{
        "model": "MiniMaxAI/MiniMax-H3",
        "prompt": "The supplied frame continues with calm, natural motion and synchronized ambient sound.",
        "seconds": 5,
        "task": "fl2va",
        "conditions": [
          {
            "type": "image",
            "uri": "file:///data/minimax-h3/first-frame.png",
            "role": "keyframe",
            "frame_index": 0
          }
        ],
        "target": {
          "short_edge": 768,
          "aspect_ratio": "auto",
          "duration_seconds": 5.0
        },
        "num_outputs_per_prompt": 1,
        "num_inference_steps": 50,
        "flow_shift": 12.0,
        "audio_flow_shift": 3.0,
        "seed": 2101
      }'
    ```
  </Tab>

  <Tab title="V2V">
    V2V uses the reference-conditioning weights. Launch the server with
    `--model-variant ref2va`, keep the request `task` set to `ref2va`, and provide a video
    reference in `conditions`. There is no separate `v2v` task value.

    Use `type: "video"` when the input may be silent. If the file has a soundtrack,
    H3 also uses it as an audio reference. Use `type: "video_audio"` only when both
    streams are required; that form rejects an input without audio. The prompt tag
    for the visual stream is `<Video 1>`; an available soundtrack is exposed as
    `<Audio 1>`.

    <Note>
      Ref2VA treats the input video as reference material, not as a pixel-aligned
      edit source. It can resynthesize or reorder motion and cuts, and it does not
      expose a denoising-strength control. Do not rely on it to preserve every source
      frame or exact timing.
    </Note>

    Set `conditions[].start_time_seconds` to select a segment from a longer source.
    The default is `0`. SGLang seeks the visual stream and soundtrack to the same
    offset, then decodes at most the requested target duration in one pass; the
    source is not re-encoded into an intermediate clip.

    ```bash Command theme={null}
    curl -sS -X POST http://127.0.0.1:30010/v1/videos \
      -H "Content-Type: application/json" \
      -d '{
        "model": "MiniMaxAI/MiniMax-H3",
        "prompt": "Follow the motion and appearance of <Video 1>, changing the setting to a moonlit bedroom while preserving coherent timing.",
        "seconds": 5,
        "task": "ref2va",
        "conditions": [
          {
            "type": "video",
            "uri": "file:///data/minimax-h3/input.mp4",
            "role": "reference",
            "start_time_seconds": 35.0
          }
        ],
        "target": {
          "short_edge": 768,
          "aspect_ratio": "16:9",
          "duration_seconds": 5.0
        },
        "num_outputs_per_prompt": 1,
        "num_inference_steps": 50,
        "flow_shift": 12.0,
        "audio_flow_shift": 3.0,
        "seed": 4101
      }'
    ```

    Use `conditions[].uri` for H3 V2V. The generic top-level `video_path`,
    `video_url`, and `video_reference` upload fields are not lowered into H3
    reference conditions.
  </Tab>

  <Tab title="Multimodal Ref2VA">
    For `ref2va`, first launch the reference-conditioning capability with
    `--model-variant ref2va`, then provide conditions with role `reference`.
    Image, video, and audio references can be combined. Material tags in the
    prompt use the one-based order for each modality.

    An image condition here is semantic reference material rather than a
    pixel-aligned first frame. Use the FL2VA tab when animating a screenshot from
    that exact starting composition.

    ```bash Command theme={null}
    curl -sS -X POST http://127.0.0.1:30010/v1/videos \
      -H "Content-Type: application/json" \
      -d '{
        "model": "MiniMaxAI/MiniMax-H3",
        "prompt": "Use <Picture 1> as the visual subject and <Audio 1> as the sound reference, with coherent natural motion.",
        "seconds": 5,
        "task": "ref2va",
        "conditions": [
          {
            "type": "image",
            "uri": "file:///data/minimax-h3/reference.png",
            "role": "reference"
          },
          {
            "type": "audio",
            "uri": "file:///data/minimax-h3/reference.mp3",
            "role": "reference"
          }
        ],
        "target": {
          "short_edge": 768,
          "aspect_ratio": "auto",
          "duration_seconds": 5.0
        },
        "num_outputs_per_prompt": 1,
        "num_inference_steps": 50,
        "flow_shift": 12.0,
        "audio_flow_shift": 3.0,
        "seed": 3101
      }'
    ```
  </Tab>
</Tabs>

Poll and download any conditioned request with the same job-status and
content endpoints used in the T2VA example. Server-local `file://` URIs must
refer to files visible inside the SGLang server environment.

## 5. LoRA recipes

H3 accepts both native fused adapters and standard Diffusers/PEFT adapters.
Native adapters target modules such as `blocks.*.attn.qkv_proj`; PEFT adapters
may instead provide separate `to_q`, `to_k`, and `to_v` projections and the
`default` adapter namespace. SGLang normalizes both layouts.

The following FL2VA adapters have distinct purposes:

| Recipe                                              | Repository and pinned file                                                                                                                     | Request setting                                                                       | Prompt requirement              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| Recommended speed/quality balance                   | [`larryvrh/MiniMax-H3-Turbo-Lora`](https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora), `minimax_h3_turbo_v4_step600_ema.safetensors`       | `num_inference_steps: 9` (8 denoiser evaluations), `lora_scale: 1.0`                  | None                            |
| Most aggressive speed preset (standard PEFT layout) | [`lightx2v/Minimax-h3-Turbo`](https://huggingface.co/lightx2v/Minimax-h3-Turbo), `minimax_h3_fl2v_turbo_4step_v0.1.safetensors`                | `num_inference_steps: 5` (4 denoiser evaluations), `lora_scale: 1.0`, `lora_alpha: 8` | None                            |
| Realistic people style                              | [`fal/MiniMax-H3-Realism-People-LoRA`](https://huggingface.co/fal/MiniMax-H3-Realism-People-LoRA), `h3-realism-people-t2v-i2v-r2v.safetensors` | Keep the normal `num_inference_steps: 50` schedule; start with `lora_scale: 0.7`      | Include `r34l1sm` in the prompt |

The H3 request field controls the number of sigma grid points, including the
terminal zero; the denoising loop therefore runs one fewer model evaluation.
This is why an adapter described as 8-step uses `9`, and a 4-step adapter uses
`5`, in the request.

All three use the same launch shape. Pinning the filename is required for
repositories that publish multiple revisions, and is also recommended for a
reproducible single-file recipe:

```bash Command theme={null}
LORA_REPO=larryvrh/MiniMax-H3-Turbo-Lora
LORA_FILE=minimax_h3_turbo_v4_step600_ema.safetensors
LORA_NAME=h3-turbo-v4
LORA_SCALE=1.0
LORA_ALPHA_ARGS=()
# LightX2V only: LORA_ALPHA_ARGS=(--lora-alpha 8)

sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --num-gpus 4 \
  --ulysses-degree 4 \
  --performance-mode speed \
  --lora-path "$LORA_REPO" \
  --lora-weight-name "$LORA_FILE" \
  --lora-nickname "$LORA_NAME" \
  --lora-scale "$LORA_SCALE" \
  "${LORA_ALPHA_ARGS[@]}" \
  --lora-merge-mode auto \
  --port 30010
```

`auto` merges an adapter into ordinary resident weights to avoid per-step LoRA
matmuls, but keeps the dynamic path for FSDP-sharded weights where a full
gather can increase peak memory. Use `dynamic` when one resident server must
switch repeatedly between base and LoRA output.

Use the filename, scale, and request schedule from the table together. The
4-evaluation LightX2V recipe is the more aggressive latency/quality tradeoff.
Its checkpoint has rank 128 but omits the training alpha from both the file and
repository metadata, so `--lora-alpha 8` is required to reproduce the author's
reference implementation. Start with the Larry 8-evaluation recipe when
preserving fine visual detail is more important than minimum latency.

These adapters were trained for the **FL2VA** partition and apply to `t2va` or
`fl2va` requests. Do not use them with the separate `ref2va` weights unless
the adapter author explicitly provides Ref2VA-compatible weights. Also avoid
stacking a distilled adapter with `quality: "high"`: both alter denoising, and
that combination has not been quality-validated.

<Warning>
  LoRAs trained for a pruned or structurally modified ComfyUI graph are not
  automatically compatible with the native H3 weights. Use only adapters whose
  architecture and target modules match the full native H3 checkpoint.
</Warning>

## 6. Sampling and output controls

MiniMax-H3 supports more than one output per prompt. The video API accepts
`num_outputs_per_prompt` (or OpenAI-compatible `n`) from 1 through 10. Offline
generation accepts `--num-outputs-per-prompt N`; `--num-outputs N` is the short
alias. A scalar seed is expanded deterministically as `seed + output_index`, so
the outputs do not reuse the same noise.

Same-prompt fan-out reuses text conditioning. On the verified 2× RTX 5090
recipe, a 5-step two-output request completed in 155.39 seconds versus 78.11
seconds for one output, while producing two distinct valid MP4 files. The
independent denoise and decode passes remain sequential on this 32 GB profile
to keep peak memory bounded; the grouped path adds essentially no orchestration
overhead. Use server replicas when lower wall-clock latency for many variants
matters more than per-server memory efficiency.

For example, set `"num_outputs_per_prompt": 2` in any request above. After the
job completes, download both outputs by selecting each zero-based variant:

```bash Command theme={null}
video_id="<completed-job-id>"
for variant in 0 1; do
  curl -sS -L \
    "http://127.0.0.1:30010/v1/videos/${video_id}/content?variant=${variant}" \
    -o "minimax-h3-${variant}.mp4"
done
```

### Choose the quality level

`quality` is a request-scoped sampling parameter with two validated levels:

* `"lossless"` (default): the exact reference path. Output is bit-exact
  against the reference implementation and the CI ground truth.
* `"high"`: the audited accelerated path. Quality is guaranteed (the audited
  Cache-DiT configuration measures SSIM 0.931 / PSNR 28.16 dB against
  `lossless`), but output is no longer bit-identical to the reference.

One resident server serves both levels; a `quality: "high"` request mounts
its audited Cache-DiT policy at the batch boundary, and a later
`quality: "lossless"` request removes the hooks before denoising.

Start the validated server once:

```bash Command theme={null}
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --num-gpus 4 \
  --tp-size 1 \
  --sp-degree 4 \
  --ulysses-degree 4 \
  --ring-degree 1 \
  --performance-mode speed \
  --use-fsdp-inference false \
  --enable-torch-compile false \
  --port 30010
```

Then choose a request level:

<Tabs>
  <Tab title="lossless (default)">
    Native denoising with no feature-cache approximation. This is the default;
    omitting the field is equivalent.

    ```json Request field theme={null}
    {
      "quality": "lossless"
    }
    ```
  </Tab>

  <Tab title="high">
    The audited accelerated path. Use it when you can trade bit-exactness for
    latency while keeping output closest to the same-seed lossless trajectory.

    ```json Request field theme={null}
    {
      "quality": "high"
    }
    ```
  </Tab>
</Tabs>

The measured trade-off is:

| `quality`  | Mean <br />inference <br />latency | Speedup | SSIM vs <br />lossless | PSNR vs <br />lossless | Expected <br />trade-off         |
| ---------- | ---------------------------------: | ------: | ---------------------: | ---------------------: | -------------------------------- |
| `lossless` |                            75.10 s |   1.00× |                  1.000 |                  exact | Native reference path            |
| `high`     |                            53.70 s |   1.40× |                  0.931 |               28.16 dB | Smallest same-seed visual change |

These numbers use 1344×768, 124-frame, 24 fps T2VA with 50 inference steps,
video flow shift 12, audio flow shift 3, and three fixed prompt/seed pairs on
4×H200. The prompts cover a quiet detailed scene, fast multi-subject action,
and a moving close-up portrait. `inference_time_s` is averaged across the three
prompts; the quiet-scene point is itself the mean of two repeats.

SSIM and PSNR compare decoded, frame-aligned output with the `lossless`
result for the same prompt and seed. They measure trajectory deviation, not
absolute perceptual quality: the `high` path can produce a different but
still plausible realization. It also changes the joint audio-video denoise
trajectory, while these two metrics cover video only.

`quality: "high"` currently accepts only the exact workload and 4×H200
deployment above; other hardware, task modes, request shapes, step counts, or
flow shifts fail before denoising. Offline generation uses the same level
name, for example `sglang generate --quality high`.

<Note>
  `quality` selects a model sampling level and can change generated content.
  `output_quality` controls only output-file compression; it is a separate field.
</Note>

For manually tuned Cache-DiT experiments outside that validated path, omit
the request `quality` field and set the process-wide environment controls
directly. An explicit `quality: "lossless"` request overrides those controls
and restores native denoising:

```bash Command theme={null}
SGLANG_CACHE_DIT_ENABLED=true \
SGLANG_CACHE_DIT_FN=1 \
SGLANG_CACHE_DIT_BN=0 \
SGLANG_CACHE_DIT_WARMUP=4 \
SGLANG_CACHE_DIT_RDT=0.12 \
SGLANG_CACHE_DIT_MC=2 \
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant ref2va \
  --num-gpus 8 \
  --ulysses-degree 8 \
  --performance-mode speed \
  --port 30010
```

<Warning>
  Cache-DiT skips selected block computation and is approximate. It cannot be
  combined with FSDP inference or DiT layerwise offload. Breakable CUDA graph
  execution takes precedence and leaves Cache-DiT disabled. Tune the cache
  thresholds only after comparing both video and audio quality on the target
  task profile. A real B200 request has completed, but the `quality: "high"`
  path above remains fail-closed to the audited 4×H200 workload.
</Warning>

## 7. Runtime feature recipes

<Tabs>
  <Tab title="Lossless runtime">
    The recommended `speed` launch already combines resident components with
    Ulysses sequence parallelism. Validation status below applies only to the
    listed hardware and topology; it is not inherited by a similar GPU family.

    | Feature                                | Validation status                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                   |
    | -------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Ulysses sequence parallelism           | Verified: 8× B200, 4× H200, 4× H100, and Ulysses1/2/4/8 on MI300X and MI355X | Use `--ulysses-degree`. Combine with Ring for cross-node scaling; see the next row.                                                                                                                                                                                                                                                                                                                                     |
    | Ring sequence parallelism (cross-node) | Verified: 2 nodes of 8× H200 each (Ulysses8 × Ring2)                         | Use `--ring-degree` together with `--nnodes`/`--node-rank`/`--dist-init-addr`. Ring shards the sequence across nodes while Ulysses shards heads within a node; H3's packed multi-segment attention only supports Ring across the node boundary, not within a single node's Ulysses group. Requires `--encoder-parallel replicate` — `auto`'s fold decision is not node-boundary aware. See the benchmark section below. |
    | SageAttention                          | Supported                                                                    | Use `--attention-backend sage_attn` to select the native packed varlen path; install the SageAttention dependency first.                                                                                                                                                                                                                                                                                                |
    | Tensor parallelism                     | Verified: B200 TP2 + Ulysses4; H100 TP2 + Ulysses2 and TP4 + Ulysses1        | `--tp-size` may be combined with Ulysses when the TP-local head count remains divisible by the Ulysses degree. On 4×H100, TP2 + Ulysses2 is the measured speed default.                                                                                                                                                                                                                                                 |
    | FSDP inference                         | Verified: 4× B200 and 4× H100 + Ulysses4                                     | Preserves H3's mixed BF16/FP32 parameter policy. B200 completed the exact eager comparison; H100 completed consecutive real requests at about 57 GB peak memory per GPU.                                                                                                                                                                                                                                                |
    | Resident components                    | Verified: B200, H200, 4×H100 with TP, and 1/2/4/8× MI300X and MI355X         | This is the recommended single-request latency path when the complete workload fits.                                                                                                                                                                                                                                                                                                                                    |
    | CPU and layerwise offload              | Verified: 2× RTX 5090 TP2; 1× RTX 4090 24 GB                                 | The 5090 lossless recipe keeps 20 DiT blocks plus both VAE encoders resident, streams the remaining DiT blocks, text encoder, and video VAE decoder blocks, and leaves the small audio VAE resident. The 4090 recipe streams DiT and the text encoder with zero resident DiT layers and **omits `vae`** from `--layerwise-offload-components`.                                                                          |
    | Breakable CUDA graph                   | Verified: B200 Ref2VA, opt-in                                                | Matching eager output was observed for the captured signature, without a measured speedup. Re-capture for other shapes and reference sets.                                                                                                                                                                                                                                                                              |
    | `torch.compile`                        | Measured: H200, opt-in                                                       | Steady-state benefit was below measurement noise, while startup increased and numerical output changed. Do not use it for consistency ground truth.                                                                                                                                                                                                                                                                     |

    The verified parallel, placement, and matching-signature BCG paths keep the
    BF16/FP32 weights and denoising math. `torch.compile` is the exception called
    out above. Always use the eager BF16/FP32 launch when producing CI consistency
    ground truth.

    For the validated 1344×768 Ref2VA profile, use a 5504-row text bucket so both
    the server warmup and reference-conditioned requests share the captured
    signature:

    ```bash Command theme={null}
    sglang serve \
      --model-path MiniMaxAI/MiniMax-H3 \
      --model-variant ref2va \
      --num-gpus 8 \
      --ulysses-degree 8 \
      --performance-mode speed \
      --enable-breakable-cuda-graph true \
      --warmup-resolutions 1344x768 \
      --bcg-text-buckets 5504 \
      --port 30010
    ```

    BCG is lossless for a matching captured signature, but capture reserves extra
    GPU memory. Re-measure the live H3 text length before reusing this bucket for a
    different task profile, reference set, resolution, or prompt template.
  </Tab>

  <Tab title="Online quantization">
    On the verified 8× B200 topology, quantize the BF16 transformer at server load:

    ```bash Command theme={null}
    sglang serve \
      --model-path MiniMaxAI/MiniMax-H3 \
      --model-variant ref2va \
      --num-gpus 8 \
      --ulysses-degree 8 \
      --performance-mode speed \
      --quantization fp8 \
      --port 30010
    ```

    H3 automatically keeps its video/audio patch projections, timestep MLP, and
    final video/audio heads in FP32. All other linear layers have stable full
    module prefixes, so additional layers can be kept unquantized:

    ```bash Command theme={null}
    sglang serve \
      --model-path MiniMaxAI/MiniMax-H3 \
      --model-variant ref2va \
      --num-gpus 8 \
      --ulysses-degree 8 \
      --quantization fp8 \
      --quantization-ignored-layers blocks.0.attn token_refiner \
      --port 30010
    ```

    <Warning>
      Online FP8 is approximate and is not a consistency ground-truth mode. It can
      be combined with Cache-DiT, but the two approximations compound. Validate
      visual quality, audio quality, memory use, and latency on the target workload.
      The picker exposes this option only on the B200 and B300 topologies used for
      real H3 validation runs.
    </Warning>

    On a single 24 GB card, use `kitchen_int8` instead of FP8. It quantizes the
    four GEMMs per DiT block online from the Hub BF16 weights (data-free, no
    calibration) and dispatches them through `comfy_kitchen.int8_linear`.
    Quantization happens after H3's grouped `qkv` reorder, so do not load an
    externally pre-quantized INT8 checkpoint here.

    ```bash Command theme={null}
    sglang generate \
      --model-path MiniMaxAI/MiniMax-H3 \
      --model-variant fl2va \
      --quantization kitchen_int8 \
      --attention-backend fa \
      --performance-mode memory \
      --layerwise-offload-components dit,text_encoder \
      --dit-offload-prefetch-size 1 \
      --dit-layerwise-resident-layers 0 \
      --enable-torch-compile false \
      --prompt "A cat walking on a sunny beach, gentle waves." \
      --save-output
    ```

    `fa` keeps exact attention. For a faster, approximate DiT path, use
    `--attention-backend sol_attn` with
    `--attention-backend-config dense_backend=sage_attn,dense_steps=10` and
    `--component-attention-backends text_encoder=torch_sdpa,transformer=sol_attn`.
    See [Quantization](/docs/sglang-diffusion/quantization#kitchen-int8-online-quantization)
    and [Attention Backends](/docs/sglang-diffusion/attention_backends#sage-then-sol-hybrid).

    <Warning>
      `kitchen_int8` changes Linear numerics. `sol_attn` / `sage_attn` also change
      the attention algorithm. Neither is a consistency ground-truth mode. The
      BF16 path is unchanged when `comfy-kitchen` is not installed.
    </Warning>

    The Qwen3-VL text encoder can be replaced independently of the DiT. To reduce
    its resident memory, point the text-encoder component at the serialized FP8
    checkpoint used in validation:

    ```bash Command theme={null}
    sglang serve \
      --model-path MiniMaxAI/MiniMax-H3 \
      --model-variant fl2va \
      --component-paths.text_encoder Qwen/Qwen3-VL-32B-Instruct-FP8 \
      --num-gpus 4 \
      --tp-size 2 \
      --ulysses-degree 2 \
      --performance-mode speed \
      --port 30010
    ```

    `--text-encoder-path` is accepted as a shorter alias. No separate quantization
    flag is required: SGLang reads the checkpoint's `quantization_config` and
    fails closed if the native encoder does not support that format. The language
    linear layers use FP8 while embeddings, normalization, and the vision tower
    remain BF16. This is an approximate serve-time choice and is incompatible with
    the strict `quality="high"` deployment contract.
  </Tab>
</Tabs>

## 8. Configuration notes

* MiniMax-H3 produces the canonical 24 fps output; request duration is expressed through `target.duration_seconds`.
* `target.duration_seconds` must be between 4 and 15 seconds, inclusive. The command picker defaults to the verified 5-second profile.
* Use a 768-pixel short edge for the released quality recipe. The aligned output dimensions are derived from `target.aspect_ratio`.
* `flow_shift` controls video diffusion and `audio_flow_shift` controls audio diffusion.
* V2V uses `task: "ref2va"` with a `video` or `video_audio` reference; it is served by the `Ref2VA` partition and is not a separate public task value.
* `conditions[].start_time_seconds` selects a non-negative offset for a video reference. Its visual and audio streams are always sought together.
* Ref2VA condition order is semantic and must match the one-based material tags in the prompt. For Ref2VA, `target.aspect_ratio: "auto"` resolves to the model's 16:9 fallback rather than inheriting a reference asset's geometry.
* The distilled pipeline uses a single denoising branch, so CFG parallelism does not apply. Do not enable it: `--enable-cfg-parallel true` or `--cfg-parallel-size` greater than 1 is rejected instead of duplicating the positive branch. Explicitly disabling CFG, or setting its size to 1, remains a valid no-op.
* The released visual VAE quality recipe uses overlapping tiled decode. SGLang keeps that recipe by default and distributes complete tiles across the decode group; this changes scheduling, not the computation inside each tile.
* H3 rejects `--vae-config.parallel-decode-mode spatial` and `spatial_shard`: validation found output mismatches. Use the default released tiled recipe.
* Keep the default `--encoder-parallel auto`. With the server’s default `batching_max_size` of 1, single-node H100/H200/B200/B300 recipes with peer-to-peer access fold the Qwen text encoder over otherwise idle Ulysses ranks. This is separate from DiT tensor parallelism. A pure-TP recipe already shards the encoder over its TP group and does not add a world fold.
* For throughput-oriented serving, select **DP (batched throughput)**. The picker pairs `--encoder-parallel dp` with an editable `--batching-max-size` greater than 1. Encoder DP stays inside each DiT replica and composes with encoder TP: the H100 TP2 + Ulysses2 recipe has two TP-sharded encoder copies that can split a batch, while the RTX 5090 pure-TP2 recipe has one encoder copy and therefore no additional batch-DP degree. It provides no benefit for a batch of one and is not bitwise-identical to the unsplit deployment.
* Use explicit **Fold** to prioritize single-request latency and encoder memory on a measured high-bandwidth single-node topology. Use **Replicate** as the compatibility path when folding or encoder DP is unsuitable.
* `--use-fsdp-inference true` shards only the DiT. MiniMax-H3 preserves the original FP32 dtype of its patch, time, and output projections during FSDP all-gather, so this path does not trade numerical correctness for memory. On 4×H100, prefer TP2 + Ulysses2 for speed; use FSDP as an explicit capacity policy rather than assuming it is faster.
* `speed` keeps model components resident, while `auto` applies the model-aware 120 GiB residency threshold. `memory` prioritizes avoiding OOM and includes the executable VAE decoder in its default layerwise set. A measured recipe with sufficient headroom can opt into `--component-residency vae=resident`; the 2×H100 CI recipe does this because the VAE's 4.8 GiB/GPU cost avoids repeated decoder transfers during tiled decode. DiT residency and prefetch knobs remain scoped to the DiT. Use `speed` only after confirming that the complete target workload fits.
* Breakable CUDA graph execution is an explicit opt-in, not part of the recommended `speed` preset. It requires `--enable-breakable-cuda-graph`, every served size in `--warmup-resolutions`, and `--bcg-text-buckets` that cover the live H3 condition sequence. The validated 1344×768 Ref2VA recipe uses 5504; other task profiles and reference sets may need a different value. It preserves eager output for matching captured signatures, but graph capture consumes additional GPU memory and may provide little latency benefit when Ulysses attention and collectives dominate, so benchmark it on the target topology before enabling it.

## 9. Benchmarks

The picker exposes resident and FSDP profiles on NVIDIA datacenter GPUs. GPU
counts are properties of the selected recipes, not a claim that every platform
requires that many GPUs. The detailed tables below report performance only for
the configurations with collected measurements:

| Hardware        | Default resident recipe               | Other profile or topology                                                     |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| B300            | 8× Ulysses8 resident                  | 8× FSDP + Ulysses8; the 8-GPU sweep is not a minimum-GPU claim.               |
| B200            | 8× Ulysses8 resident                  | 4× FSDP + Ulysses4                                                            |
| H200            | 4× Ulysses4 resident                  | 4× FSDP + Ulysses4; 4× TP2 + Ulysses2; 2 nodes × 8× Ulysses8×Ring2 cross-node |
| H100            | 4× TP2 + Ulysses2 resident            | 4× TP4 + Ulysses1; 4× FSDP + Ulysses4                                         |
| MI300X / MI355X | 8× Ulysses8 resident                  | 1×, 2×, and 4× scaling runs                                                   |
| RTX 5090        | 2× TP2 + layerwise offload            | —                                                                             |
| RTX 4090 24 GB  | 1× layerwise offload + `kitchen_int8` | Approximate attention backends are opt-in                                     |

### B300 precision and encoder placement

A 12-configuration sweep on a single 8× B300 host, covering both checkpoint
partitions, both transformer precisions, and all three text-encoder
placements. It answers one question — *how long does one request take, and how
much memory does it need*.

### What was measured

**Hardware.** 8× NVIDIA B300 SXM6, single node.

**Model.** `MiniMaxAI/MiniMax-H3`, both released weight partitions.

**Serve command.** Exactly the recipe the picker emits for B300, plus the one
or two overlay flags under test:

```bash Command theme={null}
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant fl2va \
  --num-gpus 8 \
  --ulysses-degree 8 \
  --performance-mode speed \
  --host 0.0.0.0 \
  --port 30010
```

The swept axes are `--model-variant` (`fl2va` / `ref2va`), `--quantization`
(unset for BF16 / `fp8`), and `--encoder-parallel` (`auto` / `fold` /
`replicate`). Nothing else differs between the 12 servers.

This is a single-request latency sweep (`batching_max_size: 1`), so encoder DP
is intentionally excluded: it cannot distribute a batch of one. Use the
picker’s **DP (batched throughput)** option for a multi-request throughput
deployment; the table below does not claim a measured H3 DP speedup.

**Driver.**

```bash Command theme={null}
python3 -m sglang.multimodal_gen.benchmarks.bench_serving \
  --host 127.0.0.1 --port 30010 \
  --model MiniMaxAI/MiniMax-H3 \
  --dataset vbench --task text-to-video \
  --num-prompts 1 --max-concurrency 1 \
  --warmup-requests 1 --warmup-inference-steps 50 \
  --extra-body '{"task":"t2va","conditions":[],"target":{"short_edge":768,"aspect_ratio":"16:9","duration_seconds":5.0},"seconds":5,"flow_shift":12.0,"audio_flow_shift":3.0}'
```

**Workload**

| Property                          | Value                                                       |
| --------------------------------- | ----------------------------------------------------------- |
| Output duration                   | 5.167 s                                                     |
| Resolution                        | 1344×768                                                    |
| Frames                            | 124 @ 24 fps                                                |
| Denoising steps                   | 50                                                          |
| `flow_shift` / `audio_flow_shift` | 12.0 / 3.0                                                  |
| Requests in flight                | 1 (`--max-concurrency 1`, server at `batching_max_size: 1`) |
| Requests measured                 | 1 per cell, after 1 warmup request                          |

### Results

| Weights | Precision | Encoder   |    Load |  Warmup |     Latency |   Peak/GPU |
| ------- | --------- | --------- | ------: | ------: | ----------: | ---------: |
| FL2VA   | BF16      | auto      | 118.1 s | 29.65 s | **19.04 s** |  83,578 MB |
| FL2VA   | BF16      | fold      | 114.0 s | 28.72 s | **19.04 s** |  83,578 MB |
| FL2VA   | BF16      | replicate | 116.0 s | 28.33 s | **19.04 s** | 124,158 MB |
| FL2VA   | FP8       | auto      | 116.0 s | 27.16 s | **18.03 s** |  51,926 MB |
| FL2VA   | FP8       | fold      | 116.0 s | 25.99 s | **18.04 s** |  51,926 MB |
| FL2VA   | FP8       | replicate | 118.0 s | 27.97 s | **18.04 s** |  92,506 MB |
| Ref2VA  | BF16      | auto      | 114.0 s | 38.69 s | **29.12 s** |  83,968 MB |
| Ref2VA  | BF16      | fold      | 118.0 s | 36.58 s | **29.13 s** |  83,968 MB |
| Ref2VA  | BF16      | replicate | 116.0 s | 35.17 s | **29.13 s** | 124,490 MB |
| Ref2VA  | FP8       | auto      | 124.0 s | 34.30 s | **27.12 s** |  52,816 MB |
| Ref2VA  | FP8       | fold      | 112.0 s | 34.44 s | **27.12 s** |  52,816 MB |
| Ref2VA  | FP8       | replicate | 116.0 s | 33.42 s | **27.12 s** |  93,396 MB |

### H200 topology comparison

The same four-card H200 host completed both lossless resident placements with
the standard 1344×768, 5-second, 50-step T2VA request (fixed prompt and seed,
eager BF16/FP32, back-to-back runs on an otherwise idle host). Latency is the
warmed-up request; the first pair uses the default warmup request, the second
pair adds `--warmup-resolutions 1344x768` so warmup already covers the served
resolution:

| Topology       | Warmup                          | Denoise | Decode |         E2E |  Peak/GPU |
| -------------- | ------------------------------- | ------: | -----: | ----------: | --------: |
| Ulysses4       | default                         | 79.04 s | 3.77 s | **84.14 s** | 94,288 MB |
| TP2 + Ulysses2 | default                         | 81.17 s | 2.97 s |     85.51 s | 63,490 MB |
| Ulysses4       | `--warmup-resolutions 1344x768` | 71.73 s | 1.32 s | **74.38 s** | 94,290 MB |
| TP2 + Ulysses2 | `--warmup-resolutions 1344x768` | 75.52 s | 1.29 s |     78.33 s | 63,490 MB |

Ulysses4 stays the H200 latency default: 5.0 % faster end-to-end than
TP2 + Ulysses2 once warmup covers the served resolution (1.6 % with the
default warmup, where first-request cold start masks the topology gap).
TP2 + Ulysses2 shards the DiT weights and holds peak memory about 30 GB per
GPU lower, which is why it remains the 80 GB H100 recipe. Matching the warmup
request to the served resolution removes the cold first-request cost on both
topologies (about 10 s end-to-end on this workload).

### H200 cross-node scaling

Long references and long durations grow the packed sequence length, and
Ulysses alone cannot scale sequence parallelism past the GPU count of one
node without either violating head-count divisibility or exposing
all-to-all traffic across the slower inter-node link. H3 combines
node-local Ulysses with cross-node Ring: Ring's point-to-point KV rotation
is designed to overlap with attention compute, which fits a slower
cross-node link better than an all-to-all does.

**Hardware.** 2 nodes × 8× NVIDIA H200 SXM, same cluster, InfiniBand
between nodes.

**Serve command.** The cross-node cell the picker emits for H200, run
identically on both nodes with `--node-rank` set to 0 and 1:

```bash Command theme={null}
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --model-variant ref2va \
  --num-gpus 16 \
  --nnodes 2 \
  --node-rank {{NODE_RANK}} \
  --dist-init-addr {{NODE0_IP}}:20000 \
  --sp-degree 16 \
  --ulysses-degree 8 \
  --ring-degree 2 \
  --encoder-parallel replicate \
  --performance-mode speed \
  --host 0.0.0.0 \
  --port 30010
```

**What was measured.** A controlled denoise-stage comparison on identical
hardware: 8× H200 single-node (Ulysses8, no Ring) versus the same 16-GPU
cross-node command above (Ulysses8 × Ring2), holding prompt, seed, and
step count fixed:

| Task                    | Single-node (Ulysses8) | Cross-node (Ulysses8 × Ring2) | Change |
| ----------------------- | ---------------------: | ----------------------------: | -----: |
| T2VA denoise/step       |                0.749 s |                       0.477 s | −36.3% |
| Ref2VA/V2V denoise/step |                2.572 s |                       1.494 s | −41.9% |

The gain grows with sequence length because Ring's per-hop communication
cost stays roughly constant while attention compute grows quadratically
with sequence length, so V2V's longer packed sequence benefits more than
T2VA's shorter one. With the point-to-point KV rotation pipelined against
attention compute, one V2V request's full denoise stage completed in
68.1–68.3 seconds versus 128.6 seconds on the single-node 8-GPU baseline
(−47.0%), with byte-identical output to the unpipelined cross-node path.

Cross-node determinism was confirmed separately: the same request run
twice against the same cross-node deployment produced byte-identical
output. A cross-node run's output is not expected to bit-match a
single-node run of the same prompt and seed — Ring's online-softmax merge
across hops accumulates floating-point operations in a different order
than single-node attention, which is an expected source of bit-level
difference, not a correctness regression.

<Warning>
  `--encoder-parallel auto`'s fold decision is not yet node-boundary aware
  and attempts to fold the text encoder across nodes, which crashes the
  Ref2VA reference-conditioned encoder. Always pass
  `--encoder-parallel replicate` explicitly for cross-node H3 deployments.
</Warning>

### H100 topology comparison

The same four-card H100 host completed three lossless placements. TP2 with
Ulysses2 was the fastest; TP4 used the least memory:

| Topology        | Pipeline latency | Peak/GPU |
| --------------- | ---------------: | -------: |
| TP2 + Ulysses2  |          13.25 s | 66.04 GB |
| FSDP + Ulysses4 |          13.36 s | 57.01 GB |
| TP4 + Ulysses1  |          13.86 s | 49.80 GB |

### RTX 5090 capacity run

The verified two-card RTX 5090 host used TP2 with layerwise offload. The full
50-step, 1344×768, 5-second request completed in 559.67 seconds: 525.05
seconds of denoising and 33.61 seconds of decoding, with a 26.3 GiB sampled
peak per GPU.

| DiT settings                      |       5-step denoise | Inference | Peak/GPU | Result             |
| --------------------------------- | -------------------: | --------: | -------: | ------------------ |
| prefetch 1, resident 20           |              43.48 s |   78.11 s | 26.3 GiB | Selected recipe    |
| prefetch 2, resident 20           |              43.37 s |   78.06 s | 27.5 GiB | No measurable gain |
| Ulysses2, prefetch 2, resident 10 | Did not reach warmup |         — |        — | Rejected           |

### RTX 4090 24 GB single-GPU run

One RTX 4090 D 24 GB completed the 1344×768, 107-frame, 20-NFE T2VA
workload (euler, `torch.compile` and step caching disabled) with DiT and
text-encoder layerwise offload. Same process: load → warmup (seed 0) →
timed (seed 42); only the timed pass is reported. GPU peak stayed about
18 GB.

| Config                           | Timed e2e | Denoise | vs BF16 | PSNR vs BF16 |
| -------------------------------- | --------: | ------: | ------: | -----------: |
| BF16 + FlashAttention            |   405.6 s | 370.2 s |   1.00× |            — |
| `kitchen_int8` + FA              |   303.3 s | 273.7 s |   1.34× |     24.81 dB |
| `kitchen_int8` + `sol_attn`      |   223.9 s | 203.9 s |   1.81× |     24.44 dB |
| `kitchen_int8` + `sage_attn`     |   174.9 s | 154.2 s |   2.32× |     23.51 dB |
| `kitchen_int8` + Sage→Sol hybrid |   163.8 s | 143.1 s |   2.48× |     23.04 dB |

`kitchen_int8` + FA changes Linear numerics only. The `sol_attn` /
`sage_attn` / hybrid rows also change the attention algorithm, so speed
and pixel fidelity rank in opposite orders there. Default remains
`kitchen_int8` + `fa`.

### AMD Instinct task and scaling runs

The AMD recipes keep the released BF16/FP32 precision policy and use AITER
packed attention. The picker emits the fastest measured topology, 8 GPUs with
Ulysses degree 8. All runs below completed full H.264/AAC decoding and
representative-frame inspection.

| Hardware | Task   |    Denoise |    Decode |  Peak/GPU |
| -------- | ------ | ---------: | --------: | --------: |
| MI355X   | T2VA   |  55.2907 s |  9.5344 s | 97,444 MB |
| MI355X   | FL2VA  |  53.7978 s |  9.4477 s | 96,922 MB |
| MI355X   | Ref2VA |  41.3812 s |  6.8247 s | 94,518 MB |
| MI300X   | T2VA   | 167.4878 s | 25.3244 s | 97,272 MB |
| MI300X   | FL2VA  | 150.2311 s | 12.5684 s | 96,750 MB |
| MI300X   | Ref2VA | 107.6232 s | 11.3768 s | 94,268 MB |

The task matrix used 8 GPUs and 50 denoising steps. The scaling matrix uses
one 1344×768, 209-frame T2VA request and changes only the GPU count and
matching Ulysses degree:

| Hardware | GPUs |    Denoise |    Decode |   Peak/GPU |
| -------- | ---: | ---------: | --------: | ---------: |
| MI355X   |    8 |  55.2907 s |  9.5344 s |  97,444 MB |
| MI355X   |    4 | 104.2294 s | 11.1824 s | 103,350 MB |
| MI355X   |    2 | 223.0246 s | 15.5330 s | 115,250 MB |
| MI355X   |    1 | 288.7968 s | 24.0472 s | 137,676 MB |
| MI300X   |    8 | 167.4878 s | 25.3244 s |  97,272 MB |
| MI300X   |    4 | 297.3727 s | 26.5067 s | 103,436 MB |
| MI300X   |    2 | 585.5401 s | 29.4909 s | 115,010 MB |
| MI300X   |    1 | 978.0886 s | 36.0142 s | 137,626 MB |

For a measured lower-count AMD deployment, set both `--num-gpus` and
`--ulysses-degree` to 4, 2, or 1. AITER packed attention matched segment-wise
BF16 SDPA at cosine similarity `0.9999991655` on MI355X and `0.9999991059` on
MI300X.
