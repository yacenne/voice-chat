"""
WebRTC Signaling Server - FINAL VERSION
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import json
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="WebRTC Signaling Server")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active connections
connections: Dict[str, WebSocket] = {}


@app.get("/")
async def root():
    return {
        "status": "running",
        "active_users": list(connections.keys()),
        "total_connections": len(connections)
    }


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    # Accept connection
    await websocket.accept()
    connections[user_id] = websocket
    
    logger.info(f"✅ '{user_id}' connected! Total: {len(connections)} users")
    logger.info(f"📋 Online users: {list(connections.keys())}")
    
    try:
        # Send welcome
        await websocket.send_json({
            "type": "welcome",
            "user_id": user_id,
            "message": f"Welcome {user_id}!",
            "online_users": list(connections.keys())
        })
        
        # Listen for messages
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            msg_type = message.get("type")
            target = message.get("target")
            
            logger.info(f"📨 '{user_id}' → {msg_type} → '{target}'")
            
            # Forward message
            if target and target in connections:
                message["from"] = user_id
                try:
                    await connections[target].send_json(message)
                    logger.info(f"✅ Forwarded {msg_type} from '{user_id}' to '{target}'")
                except Exception as e:
                    logger.error(f"❌ Error forwarding to '{target}': {e}")
            else:
                logger.warning(f"⚠️ Target '{target}' not found! Online: {list(connections.keys())}")
                # Notify sender
                await websocket.send_json({
                    "type": "error",
                    "message": f"User '{target}' is not online"
                })
    
    except WebSocketDisconnect:
        logger.info(f"❌ '{user_id}' disconnected")
    
    except Exception as e:
        logger.error(f"❌ Error with '{user_id}': {e}")
    
    finally:
        if user_id in connections:
            del connections[user_id]
        logger.info(f"🧹 '{user_id}' removed. Remaining: {len(connections)}")


if __name__ == "__main__":
    import uvicorn
    
    print("=" * 60)
    print("🚀 WebRTC Signaling Server Starting...")
    print("=" * 60)
    print("📍 URL: http://localhost:8000")
    print("📚 Docs: http://localhost:8000/docs")
    print("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
