# 1 control-plane + N workers: con un solo nodo (como sa-p8) no hay
# anti-afinidad posible ni nodo que drenar sin tumbar el servicio.
resource "kind_cluster" "sa_p9" {
  name           = var.cluster_nombre
  node_image     = var.node_image
  wait_for_ready = true
  # Fusiona el contexto kind-sa-p9 en el kubeconfig del operador.
  kubeconfig_path = pathexpand("~/.kube/config")

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    node {
      role = "control-plane"
    }

    dynamic "node" {
      for_each = range(var.workers)
      content {
        role = "worker"
      }
    }
  }
}
