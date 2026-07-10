# RJCut 前端数字人身份修复 v0.5

适用目录：

```text
D:\workspace\rjcut\studio
```

这个补丁只修改 Studio 前端，不修改 RJCut Python 后端，也不修改 `192.168.166.151:8080` 服务。

## 修复的问题

原代码虽然给重复数字人卡片创建了 `uniqueId`，但是：

```text
选中判断仍使用 selectedPerson.id
生成请求仍发送 selectedPerson.id
详情接口仍按重复 id 查询
```

因此多张卡片可能显示不同人物，但生成请求实际发送同一个旧 ID，例如 `dp_human`，最后 8080 使用默认人物。

## 新逻辑

```text
数字人卡片
  -> 从 generation_person_id / preview_video_url / cover 路径解析生成身份
  -> 生成稳定 selectionKey
  -> 用户选择时锁定 generation_person_id
  -> POST /v1/digital-human/generate
       person_id = generation_person_id
  -> 如果结果返回 resolved_person_id，前端进行一致性校验
```

对公共数字人，解析优先级为：

```text
显式 generation_person_id
preview_video_url 文件名
cover/pic_path 文件名
旧 person_id / id
name
```

例如：

```text
preview_video_url=/root/MuseTalk/data/video/Mona_Lisa_by_Leonardo_da_Vinci.mp4
```

前端发送：

```json
{
  "person_id": "Mona_Lisa_by_Leonardo_da_Vinci"
}
```

不再发送所有卡片共用的：

```json
{
  "person_id": "dp_human"
}
```

## 安装后验证

```powershell
cd D:\workspace\rjcut\studio

node .\scripts\test_digital_human_person_identity.mjs
node .\scripts\test_digital_human_project.mjs
npm run build
```

第一个测试正确输出：

```text
DIGITAL_HUMAN_PERSON_IDENTITY=PASS
```

## 浏览器检查

重新启动 Studio，打开开发者工具，在 Console 中应看到：

```text
[DigitalHumanStudio] 已锁定数字人生成身份
[DigitalHumanStudio] 提交数字人生成请求
```

选择蒙娜丽莎时，日志里的 `generationPersonId` 应是蒙娜丽莎对应的预览视频文件名，而不是其他卡片共用的旧 ID。

如果 8080 成功结果提供：

```json
{
  "resolved_person_id": "Mona_Lisa_by_Leonardo_da_Vinci"
}
```

前端还会强制核对；不一致时任务直接失败，不再下载并命名成错误人物。
