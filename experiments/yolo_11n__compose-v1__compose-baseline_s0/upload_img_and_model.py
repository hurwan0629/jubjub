from pathlib import Path
import random, yaml
import numpy as np
import cv2
import wandb
from ultralytics import YOLO

SEED = 0

run_dir = Path(r"C:\LANG_CHAIN_2026\runs\detect\experiments\yolo_11n__compose-v1__compose-baseline_s0\run")

best = run_dir / "weights" / "best.pt"
model = YOLO(best)

cfg = yaml.safe_load(open("data/compose/data.yaml", encoding="utf-8"))
val = Path(cfg.get("path", ".")) / cfg["val"]

# list of img path
imgs = [l.strip() for l in open(val, encoding="utf-8") if l.strip()]

random.seed(SEED)
picked = random.sample(imgs, 20)

results = model.predict(picked, imgsz=640, conf=0.25, verbose=False)

tiles = [cv2.resize(r.plot(), (320, 320)) for r in results]
# 4, 5
rows = [np.hstack(tiles[i:i+5]) for i in range(0, 20, 5)]
grid = np.vstack(rows)[:, :, ::-1]

run = wandb.init(
  entity="hurwan0629-something", 
  project="jubjub",
  id="e5oku1xw", 
  resume="must"
)   # 새 run으로 올리려면 id·resume 대신 name="..."



run.log({
  "images/val_pred_grid": wandb.Image(grid, caption="val random 20, seed 0"),
})

run.log({
  f"images/{file_path.stem}": wandb.Image(str(file_path))
  for file_path
  in run_dir.iterdir() 
  if file_path.suffix.lower() in {".png", ".jpg"}
})


art = wandb.Artifact("yolo11n-best", type="model")
art.add_file(str(best))
run.log_artifact(art, aliases=["best"])

run.finish()