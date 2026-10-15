# local-path de kind crea PV hostPath, que Velero File System Backup NO
# respalda. Con defaultVolumeType=local el PV sale como spec.local, que
# si es compatible (validado en P9/spike/RESULTADOS.md).
# Se vuelve la StorageClass por defecto para que NINGUN PVC del sistema
# quede en hostPath (dejaria los respaldos en PartiallyFailed).
resource "kubernetes_storage_class_v1" "local_velero" {
  metadata {
    name = "local-velero"
    annotations = {
      "defaultVolumeType"                           = "local"
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }
  storage_provisioner = "rancher.io/local-path"
  reclaim_policy      = "Delete"
  volume_binding_mode = "WaitForFirstConsumer"
}

resource "kubernetes_annotations" "standard_no_default" {
  api_version = "storage.k8s.io/v1"
  kind        = "StorageClass"
  metadata {
    name = "standard"
  }
  annotations = {
    "storageclass.kubernetes.io/is-default-class" = "false"
  }
  force = true
}
