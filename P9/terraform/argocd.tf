resource "helm_release" "argocd" {
  name             = "argocd"
  namespace        = "argocd"
  create_namespace = true
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = "10.10.5"
  wait             = true
  timeout          = 600

  values = [yamlencode({
    dex = { enabled = false }
    configs = {
      params = { "server.insecure" = true }
      cm = {
        # Sin este health check, ArgoCD considera "Healthy" a una
        # Application hija apenas existe, y las sync-waves entre apps
        # (sealed-secrets -> kyverno -> sa-platform) no esperan de verdad.
        "resource.customizations.health.argoproj.io_Application" = <<-EOT
          hs = {}
          hs.status = "Progressing"
          hs.message = ""
          if obj.status ~= nil then
            if obj.status.health ~= nil then
              hs.status = obj.status.health.status
              if obj.status.health.message ~= nil then
                hs.message = obj.status.health.message
              end
            end
          end
          return hs
        EOT
      }
    }
  })]

  depends_on = [kubernetes_secret_v1.sealed_secrets_key]
}

# Aplicacion raiz (app-of-apps). Se crea con el chart argocd-apps en vez
# de kubernetes_manifest: este ultimo necesita el CRD Application ya
# instalado en el momento del plan, y en una reconstruccion no existe.
resource "helm_release" "root_app" {
  name       = "sa-p9-root"
  namespace  = helm_release.argocd.namespace
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argocd-apps"
  version    = "2.0.6"

  values = [yamlencode({
    applications = {
      "sa-p9-root" = {
        namespace  = "argocd"
        project    = "default"
        finalizers = ["resources-finalizer.argocd.argoproj.io"]
        source = {
          repoURL        = var.gitops_repo
          targetRevision = var.gitops_revision
          path           = var.gitops_path
        }
        destination = {
          server    = "https://kubernetes.default.svc"
          namespace = "argocd"
        }
        syncPolicy = {
          automated   = { prune = true, selfHeal = true }
          syncOptions = ["CreateNamespace=true"]
          retry = {
            limit   = 10
            backoff = { duration = "10s", factor = 2, maxDuration = "3m" }
          }
        }
      }
    }
  })]

  depends_on = [null_resource.restaurar_datos]
}
