---
license: mit
dataset_info:
  features:
  - name: image
    dtype: image
  - name: label
    dtype:
      class_label:
        names:
          '0': cardboard
          '1': glass
          '2': metal
          '3': paper
          '4': plastic
          '5': trash
  - name: label_id
    dtype: int64
  - name: label_name
    dtype: string
  - name: source_dataset
    dtype: string
  - name: original_label
    dtype: string
  - name: image_context
    dtype: string
  splits:
  - name: inference
    num_bytes: 1026180182
    num_examples: 348
  download_size: 1026205047
  dataset_size: 1026180182
configs:
- config_name: default
  data_files:
  - split: inference
    path: data/inference-*
language:
- en
tags:
- waste-classification
- ood
- image_classification
pretty_name: Wild Trash Inference Dataset
task_categories:
- image-classification
---

# Wild Trash Inference Dataset

The **Wild Trash Inference Dataset** is a custom image dataset created by the TrashBusters project for evaluating waste-classification models under realistic outdoor conditions.

Unlike many public waste datasets, which contain centered objects, clean backgrounds, or controlled lighting, this dataset contains waste objects photographed in natural environments. The images include variations in background, lighting, camera angle, object size, object position, and partial occlusion.

The dataset is intended primarily as an **external inference and robustness evaluation dataset**, rather than as a model-training dataset.

* **Repository:** `TrashBusters/wild-trash-inference-dataset`
* **Task:** Multi-class image classification
* **Number of classes:** 6
* **Number of images:** Approximately 350
* **Language:** Not applicable
* **Primary use:** Evaluation under domain shift

## Dataset Motivation

The public datasets used to train the TrashBusters models contain images collected from different sources and under different visual conditions. However, many images still present waste objects in relatively clean or recognizable settings.

A model that performs well on a conventional held-out test set may not necessarily generalize to waste encountered outdoors. Models may rely on background patterns, object placement, lighting conditions, or dataset-specific visual cues instead of learning the actual characteristics of the waste objects.

This custom dataset was therefore created to answer the following question:

> Can models trained on public waste datasets correctly classify waste objects photographed in realistic outdoor environments?

The dataset introduces a deliberate domain shift between the training data and the final evaluation data.

## Dataset Content

The dataset uses the same six-class label structure as the main TrashBusters training dataset:

| Label       | Description                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| `cardboard` | Cardboard packaging, boxes, and related cardboard objects                         |
| `glass`     | Glass bottles, containers, and broken glass objects                               |
| `metal`     | Metal cans, containers, and other metallic waste                                  |
| `paper`     | Paper sheets, paper packaging, and similar paper waste                            |
| `plastic`   | Plastic bottles, packaging, cups, and other plastic objects                       |
| `trash`     | Waste that does not clearly belong to one of the five recyclable material classes |

The `trash` class functions as a broad residual category. It can therefore contain greater visual variation than the other classes.

## Data Collection

The images were collected manually by members of the TrashBusters project in an outdoor park environment.

Waste objects were photographed under naturally occurring conditions rather than in a controlled photography setup. The images include differences in:

* Natural backgrounds such as grass, soil, leaves, and pavement
* Lighting and shadows
* Camera distance and viewing angle
* Object orientation
* Object scale within the image
* Background clutter
* Partial object occlusion
* Object condition, including deformation, dirt, and damage

These characteristics make the dataset more representative of a real-world waste-recognition scenario.

## Dataset Structure

Each sample contains an image and its corresponding waste category.

A dataset entry may have a structure similar to the following:

```python
{
    "image": <PIL.Image.Image>,
    "label": 4,
    "label_name": "plastic"
}
```

Depending on the published dataset configuration, additional metadata fields may also be available.

### Example Fields

| Field        | Type                  | Description                  |
| ------------ | --------------------- | ---------------------------- |
| `image`      | Image                 | The waste image              |
| `label`      | ClassLabel or integer | Encoded class identifier     |
| `label_name` | String                | Human-readable category name |

## Loading the Dataset

The dataset can be loaded using the Hugging Face `datasets` library:

```python
from datasets import load_dataset

dataset = load_dataset(
    "TrashBusters/wild-trash-inference-dataset"
)

print(dataset)
print(dataset["train"][0])
```

The available split name should be checked after loading:

```python
print(dataset.keys())
```

To display an example:

```python
sample = dataset["train"][0]

print(sample["label"])
print(sample.get("label_name"))

sample["image"].show()
```

## Intended Uses

The dataset is intended for:

* External evaluation of waste-classification models
* Domain-shift evaluation
* Out-of-distribution robustness analysis
* Comparison of CNN, transformer, and MLP-based image classifiers
* Error analysis
* Explainable AI analysis
* Investigation of background bias
* Evaluation of real-world generalization

The dataset was used in the TrashBusters project to evaluate the following model architectures:

* ResNet-18
* ConvNeXt-Tiny
* DeiT
* MLP-Mixer

It was also used together with explainability methods such as:

* Grad-CAM
* Occlusion sensitivity
* Integrated Gradients

These methods helped investigate whether the models focused on the waste object itself or on irrelevant environmental features such as grass and surrounding vegetation.

## Recommended Evaluation

Because this dataset is intended for evaluation rather than training, results should be reported separately from results obtained on the standard test split of the training dataset.

Recommended metrics include:

* Overall accuracy
* Macro-averaged precision
* Macro-averaged recall
* Macro-averaged F1-score
* Per-class precision
* Per-class recall
* Per-class F1-score
* Confusion matrix

Macro-averaged metrics are particularly important because the custom dataset is not necessarily balanced across all six classes.

Example evaluation:

```python
import evaluate
import numpy as np

accuracy_metric = evaluate.load("accuracy")
f1_metric = evaluate.load("f1")

predictions = np.asarray(predictions)
references = np.asarray(references)

accuracy = accuracy_metric.compute(
    predictions=predictions,
    references=references,
)

macro_f1 = f1_metric.compute(
    predictions=predictions,
    references=references,
    average="macro",
)

print(accuracy)
print(macro_f1)
```

## Class Imbalance

The class distribution reflects the waste objects that were available during data collection. Consequently, the dataset may contain different numbers of examples for each category.

This imbalance is acceptable for the intended use because the dataset serves as an external real-world evaluation set rather than as a balanced training set.

However, users should avoid relying only on overall accuracy. Macro-averaged and per-class metrics should also be reported so that results are not dominated by classes containing more images.

The class distribution should not be artificially balanced through duplication or oversampling during evaluation.

## Domain Shift

The dataset differs from the main TrashBusters training dataset in several ways:

| Aspect           | Training dataset                           | Wild inference dataset                     |
| ---------------- | ------------------------------------------ | ------------------------------------------ |
| Data source      | Combined public datasets                   | Custom manual collection                   |
| Environment      | Mixed controlled and real-world settings   | Outdoor natural environment                |
| Background       | Often clean or dataset-specific            | Grass, leaves, soil, pavement, and clutter |
| Object placement | Frequently centered and clearly visible    | Variable position and scale                |
| Lighting         | Dataset-dependent                          | Natural and variable                       |
| Intended purpose | Training, validation, and standard testing | External robustness evaluation             |

The performance difference between the standard test dataset and this dataset can be interpreted as an indication of the model’s sensitivity to domain shift.

However, it should not be treated as a universal measure of real-world waste-classification performance because the dataset represents only a limited set of locations and environmental conditions.

## Data Quality

The images were manually collected and labelled according to the six TrashBusters categories.

Potential sources of ambiguity include:

* Objects composed of multiple materials
* Dirty or damaged objects
* Partially visible objects
* Transparent objects
* Crushed packaging
* Objects whose material cannot be determined reliably from appearance alone
* Items that could reasonably fit both a recyclable class and the general `trash` class

The labels represent the annotators’ best visual assessment of the primary material or appropriate residual category.

## Limitations

The dataset has several limitations:

1. **Small dataset size**

   The dataset contains only approximately 350 images. Results may therefore vary considerably between classes, particularly for classes with few examples.

2. **Limited geographic coverage**

   The images were collected in a limited outdoor area and may not represent waste encountered in other cities, countries, climates, or seasons.

3. **Class imbalance**

   The dataset was collected naturally and was not designed to contain an equal number of examples for every class.

4. **Single-label formulation**

   Some waste objects contain several materials, but each image receives only one class label.

5. **Broad `trash` category**

   The `trash` class contains visually diverse objects and may be more difficult to classify consistently.

6. **Material ambiguity**

   An object’s material cannot always be determined accurately from an image alone.

7. **Not a detection dataset**

   The dataset provides image-level classification labels and does not provide object bounding boxes or segmentation masks.

8. **Environmental coverage**

   Although the dataset introduces an outdoor domain shift, it does not cover every real-world condition, such as snow, heavy rain, nighttime scenes, industrial waste, beaches, or underwater environments.

## Out-of-Scope Uses

The dataset is not designed for:

* Training production-ready waste-management systems by itself
* Hazardous-waste identification
* Medical-waste classification
* Chemical identification
* Automated recycling decisions without human supervision
* Object detection or semantic segmentation
* Estimating whether an object is legally recyclable in a particular municipality
* Evaluating all possible real-world waste environments

Recycling rules can differ by region. The dataset labels describe broad visual material categories and should not be interpreted as local disposal instructions.

## Ethical Considerations

The dataset focuses on discarded objects and natural backgrounds. Images should be reviewed before publication to ensure that they do not contain identifiable people, private information, vehicle registration plates, or other sensitive visual information.

Models evaluated on this dataset may still learn undesirable correlations between waste classes and environmental features. Explainability methods and error analysis are recommended before applying such models in real-world systems.

## Relationship to the Main TrashBusters Dataset

The models evaluated with this dataset were trained using a harmonized dataset constructed from four public waste-classification datasets:

* TrashNet
* Recyclable and Household Waste Classification
* Garbage Classification V2
* TriCascade Waste Datasets

The harmonized training dataset uses the same six output classes as this custom evaluation dataset.

Keeping the custom images separate from the training dataset prevents evaluation leakage and provides a more realistic estimate of model generalization to previously unseen data sources and environments.

## Dataset Creation Team

The dataset was created as part of the **TrashBusters** machine-learning project.

## Licensing

A license has not been specified in this dataset card.

Before redistributing or using the dataset outside research or educational contexts, users should check the license information provided in the Hugging Face repository and confirm that the collected images can be used for the intended purpose.

## Citation

When using this dataset, please cite the TrashBusters project and reference the Hugging Face repository:

```bibtex
@misc{trashbusters_wild_trash_inference_dataset,
  title        = {Wild Trash Inference Dataset},
  author       = {{TrashBusters}},
  year         = {2026},
  howpublished = {\url{https://huggingface.co/datasets/TrashBusters/wild-trash-inference-dataset}},
  note         = {Custom outdoor dataset for domain-shift evaluation of waste-classification models}
}
```

## Acknowledgements

The dataset was created to support research into robust and explainable waste classification, with a particular focus on performance degradation caused by real-world environmental changes.

---