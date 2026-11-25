import platform
import torch
import wandb
from ultralytics import YOLO, settings
import ultralytics

# 루트에서 실행
DATA = "data/compose/data.yaml"
OUT = "experiments/yolo_11n__compose-v1__compose-baseline_s0"
CLASSES = ["general", "plastic", "can", "glass"]
SEED = 0

GROUP = "yolo_11n__compose-v1__compose_baseline"
RUN_NAME = f"{GROUP}__s{SEED}"

TRAIN_ARGS = dict(
  data=DATA,
  epochs=100,
  patience=20,
  imgsz=640,
  batch=16,
  device=0,
  seed=0,
  project=OUT,
  name="run"
)

def log_epoch(trainer):
  """매 에폭 끝에 Ultralytics가 불러주는 함수. WANDB.md 형식대로 작성"""
  m = trainer.metrics
  row = {"epoch": trainer.epoch + 1}
  row.update(trainer.label_loss_items(trainer.tloss, prefix="train"))
  row.update(m)
  row.update({
    "val/precision": m["metrics/precision(B)"],
    "val/recall": m["metrics/recall(B)"],
    "val/map50": m["metrics/mAP50(B)"],
    "val/map50_95": m["metrics/mAP50-95(B)"]
  })
  row.update({f"train/lr_pg{i}": v for i, v in enumerate(trainer.lr.values())})
  wandb.log(row)

def main():
  # Ultralytics 자체 wandb 제외
  settings.update({"wandb": False})

  # wandb run 시작
  wandb.init(
    entity="hurwan0629-something",
    project="jubjub",
    name=RUN_NAME,
    group=GROUP,
    config={
      "model/id": "yolo11n",
      "model/init_weights": {"source": "yolo11n.pt (COCO pretrained)"},
      "data/id": "compose", "data/version": "v1",
      "data/split_id": "compose-v1 (데이터셋별 원래 분할 합침, AIHub 제외)",
      "data/classes": CLASSES,
      "train/args": TRAIN_ARGS, 
      "train/seed": SEED,
      "env/versions": {
        "python": platform.python_version(),
        "framework": ultralytics.__version__,
        "torch": torch.__version__,
        "cuda": torch.version.cuda
      }
    }
  )
  # 학습
  model = YOLO("yolo11n.pt")
  model.add_callback("on_fit_epoch_end", log_epoch)
  model.train(**TRAIN_ARGS)

  # 최고모델로 val 평가
  best = YOLO(model.trainer.best)
  m = best.val(data=DATA, split="val", project=OUT, name=f"eval")
  print("val mAP50:", round(m.box.map50, 3), "mAP50-95:", round(m.box.map, 3))
  print("  클래스별 mAP50-95:", [round(v, 3) for v in m.box.maps])

  # wandb 최종 결과물을 summary에 저장
  wandb.summary.update({
    "eval/precision": m.box.mp,
    "eval/recall": m.box.mr,
    "eval/map50": m.box.map50,
    "eval/map50_95": m.box.map,
    "model/selection_metric": "fitness"
  })
  wandb.log({
    "eval/per_class_ap": wandb.Table(
      columns=["class", "ap50-95"],
      data=[[c, float(v)] for c, v in zip(CLASSES, m.box.maps)]
    )})
  wandb.finish()

if __name__ == "__main__":
  main()