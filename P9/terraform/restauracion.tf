# Si R2 ya tiene respaldos (es decir, esto es una RECONSTRUCCION y no el
# primer despliegue), restaura PostgreSQL del ultimo respaldo Completed
# antes de crear la aplicacion raiz de ArgoCD. Se vuelve a ejecutar cada
# vez que se crea un cluster nuevo. El trigger es la CA del cluster (kind
# genera una nueva en cada creacion); el id NO sirve porque es siempre
# "sa-p9-<imagen>" y la restauracion nunca se repetiria.
resource "null_resource" "restaurar_datos" {
  count = var.restaurar_datos ? 1 : 0

  triggers = {
    cluster_ca = sha1(kind_cluster.sa_p9.cluster_ca_certificate)
  }

  provisioner "local-exec" {
    command = "${path.module}/../scripts/restaurar-datos.sh"
    environment = {
      CTX      = "kind-${var.cluster_nombre}"
      NS       = "sa-p9-produccion"
      SCHEDULE = var.velero_schedule
    }
  }

  depends_on = [
    helm_release.velero,
    kubernetes_namespace_v1.ambiente,
    kubernetes_resource_quota_v1.cuota,
    kubernetes_limit_range_v1.limites,
  ]
}
