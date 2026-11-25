
from pathlib import Path
import wandb
run_dir = Path(r"C:\LANG_CHAIN_2026\runs\detect\experiments\yolo_11n__compose-v1__compose-baseline_s0\run")
d = {
    f"images/{p.stem}": wandb.Image(str(p))
    for p in run_dir.iterdir()
    if p.suffix.lower() in {".png", ".jpg"}
}
print(len(d), list(d))