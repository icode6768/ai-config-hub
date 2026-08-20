---
name: ai-image-generator
description: Generate AI images using the project's backend API. Use when the user asks to generate, create, or draw images with AI. Supports text-to-image and image-to-image with various styles, sizes, and resolutions.
---

# AI Image Generator

This skill generates AI images by calling either a **local** backend (Flask app context) or a **remote server** API. It supports two modes, configurable via `config.json`.

## When to Use This Skill

- User asks to "generate an image", "draw a picture", "create an AI image"
- User provides a text prompt and wants an AI-generated image
- User wants to generate images with specific styles, sizes, or resolutions

## Mode Configuration

The skill supports two modes, controlled by `.claude/skills/ai-image-generator/config.json`:

### config.json Structure

```json
{
  "mode": "server",
  "server": {
    "url": "https://api.dongchuangai.com",
    "username": "20000",
    "password": "ak222222",
    "token": ""
  },
  "local": {
    "user_id": 1,
    "app_base_url": "http://localhost:5000"
  }
}
```

### Mode: `server` (Default)

Calls the deployed server API via HTTP. No local backend required.

**Flow:**
1. Login with `username` + `password` -> get JWT token (auto-cached to config.json)
2. `POST /api/v1/images/process` -> create image generation task
3. `GET /api/v1/images/history/{id}` -> poll until `done` / `failed`
4. Return result image URLs

**When to use:** When the backend is deployed on a server (e.g. `https://api.dongchuangai.com`). This is the recommended mode for most cases.

### Mode: `local`

Uses local Flask app context directly (requires local backend running, Redis, RunningHub access).

**Flow:**
1. Initialize Flask app from `backend/` directory
2. Call `AIImageProcessor.create_history()` + `start_process()` directly
3. Poll database until `status == 'done'`
4. Return result image URLs

**When to use:** When developing locally with the backend running on `localhost:5000`.

### Switching Modes

To switch modes, edit the `"mode"` field in `config.json`:
- `"mode": "server"` -> Use server API (recommended)
- `"mode": "local"` -> Use local Flask app

You can also override the mode at runtime with the `--mode` flag:
```bash
python generate_image.py "prompt" --mode server
python generate_image.py "prompt" --mode local
```

### Configuring Server Credentials

To change the server URL or login credentials, edit the `"server"` section in `config.json`:
```json
{
  "server": {
    "url": "https://your-server.com",
    "username": "your_username",
    "password": "your_password",
    "token": ""
  }
}
```

The token will be auto-cached after the first successful login. If the token expires, the script automatically re-logins.

## API Architecture

The image generation follows an async task pattern:

1. **Create Task**: `POST /api/v1/images/process` - creates an `AIImageHistory` record, submits to RunningHub workflow
2. **Poll Status**: `GET /api/v1/images/history/{task_id}` - check task status until `done` or `failed`
3. **Webhook Callback**: RunningHub calls back to update the task when complete (happens in background)

### Database Model: `AIImageHistory`
- `id`: Primary key (used as task reference)
- `category_key`: Task category (use `draw` for text-to-image)
- `prompt`: The text prompt describing the desired image
- `image_size`: Aspect ratio (e.g., `1:1`, `16:9`, `9:16`, `3:4`, `4:3`)
- `resolution`: Output quality (`1k`, `2k`, `4k`)
- `status`: `pending` -> `processing` -> `done` / `failed`
- `result_images`: JSON array of result image paths (populated when `done`)
- `source_images`: JSON array of source image URLs (for image-to-image)
- `reference_images`: JSON array of reference image URLs

## Implementation Steps

When the user asks to generate an image, execute the Python script at `.claude/skills/ai-image-generator/scripts/generate_image.py`:

### Step 1: Run the script

The script automatically reads `config.json` to determine the mode.

```bash
E:/mywroks/project/ai-digital-human-system/.venv/Scripts/python.exe E:/mywroks/project/ai-digital-human-system/.claude/skills/ai-image-generator/scripts/generate_image.py "<prompt>" "<size>" "<resolution>" "<style>"
```

**With explicit mode override:**
```bash
E:/mywroks/project/ai-digital-human-system/.venv/Scripts/python.exe E:/mywroks/project/ai-digital-human-system/.claude/skills/ai-image-generator/scripts/generate_image.py "<prompt>" "<size>" "<resolution>" "<style>" --mode server
```

**Parameters:**
- `<prompt>`: The image description (required)
- `<size>`: Aspect ratio, default `1:1`. Options: `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `2:3`, `3:2`, `4:5`, `5:4`, `21:9`
- `<resolution>`: Quality, default `1k`. Options: `1k`, `2k`, `4k`
- `<style>`: Art style, default `realistic`. Options: `realistic`, `anime`, `cartoon`, `oil_painting`, `watercolor`
- `--mode`: Override mode. Options: `local`, `server`

### Step 2: Report results

After the script completes:
- If `status === "done"`: Show the user the image URLs. The images can be viewed at the returned URLs.
- If `status === "failed"`: Report the error to the user.
- If `status === "timeout"`: Tell the user the task is still processing and provide the task_id for them to check later.

## Important Notes

- **Server mode**: Requires valid server URL, username, and password in config.json. Token is auto-managed.
- **Local mode**: Requires the backend running on `localhost:5000`, Redis, and RunningHub access.
- Image generation typically completes in 30-120 seconds
- Result images are stored on the server. URLs follow the pattern: `{server_url}/{relative_path}`
- The `requests` Python package is required for server mode (should be in the project's venv)

## Supported Categories

While this skill focuses on `draw` (text-to-image), the system also supports:
- `retouch`: Photo retouching/editing
- `home`: Home design/interior decoration
- `fashion`: Fashion shooting
- `poster`: Poster design
- `expand`: Image expansion/outpainting
- `matting`: Background removal
- `restore`: Photo restoration
- `enhance`: Image enhancement
- `fusion`: Image fusion

## Example Prompts

| Prompt | Style | Size | Description |
|--------|-------|------|-------------|
| "A cute golden retriever puppy in a garden" | realistic | 1:1 | Square photo |
| "Cyberpunk city at night, neon lights" | realistic | 16:9 | Widescreen |
| "A magical forest with glowing mushrooms" | anime | 9:16 | Vertical/phone |
| "Portrait of a warrior princess" | oil_painting | 3:4 | Portrait |
| "Ocean waves crashing on rocks at sunset" | watercolor | 16:9 | Landscape |
