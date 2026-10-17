# Velero lo instala Terraform (no ArgoCD) porque la restauracion de
# PostgreSQL debe ocurrir ANTES de que ArgoCD cree un PostgreSQL con
# volumen vacio. El Schedule (calendario y retencion) si vive en GitOps.
locals {
  r2_endpoint = "https://${var.r2_account_id}.r2.cloudflarestorage.com"
}

resource "kubernetes_namespace_v1" "velero" {
  metadata {
    name = "velero"
  }
}

resource "kubernetes_secret_v1" "velero_r2" {
  metadata {
    name      = "velero-r2"
    namespace = kubernetes_namespace_v1.velero.metadata[0].name
  }
  # El archivo del operador se copia tal cual al Secret que lee Velero.
  data = {
    cloud = file(pathexpand(var.r2_archivo_credenciales))
  }
}

resource "helm_release" "velero" {
  name       = "velero"
  namespace  = kubernetes_namespace_v1.velero.metadata[0].name
  repository = "https://vmware-tanzu.github.io/helm-charts"
  chart      = "velero"
  version    = "12.2.1"
  wait       = true
  timeout    = 600

  values = [yamlencode({
    image = {
      repository = "velero/velero"
      tag        = "v1.18.4"
    }
    # >= v1.14.3: no envia el header x-amz-tagging vacio que R2 rechaza.
    initContainers = [{
      name            = "velero-plugin-for-aws"
      image           = "velero/velero-plugin-for-aws:v1.14.4"
      imagePullPolicy = "IfNotPresent"
      volumeMounts    = [{ mountPath = "/target", name = "plugins" }]
    }]
    credentials = {
      useSecret      = true
      existingSecret = kubernetes_secret_v1.velero_r2.metadata[0].name
    }
    snapshotsEnabled = false
    deployNodeAgent  = true
    configuration = {
      uploaderType             = "kopia"
      defaultVolumesToFsBackup = true
      backupStorageLocation = [{
        name     = "default"
        provider = "aws"
        bucket   = var.r2_bucket
        prefix   = var.velero_prefijo
        default  = true
        config = {
          region            = "auto"
          s3ForcePathStyle  = "true"
          s3Url             = local.r2_endpoint
          checksumAlgorithm = ""
        }
      }]
      volumeSnapshotLocation = []
    }
  })]

  depends_on = [kubernetes_storage_class_v1.local_velero]
}
