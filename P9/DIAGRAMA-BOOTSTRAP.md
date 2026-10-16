# Diagrama del bootstrap — orden de reconstrucción y dependencias

Versión en imagen: [diagrama-bootstrap.png](diagrama-bootstrap.png).

Leyenda: 🟧 **manual, una sola vez** (no se pierde con el clúster) ·
🟦 **automático** (`./P9/bootstrap.sh`, sin intervención) ·
🟩 **automático vía GitOps** (ArgoCD) · ⬜ **externo al clúster** (sobrevive al desastre).

```mermaid
flowchart TD
  subgraph MANUAL["🟧 Prerrequisitos manuales (una sola vez)"]
    M1["Cuenta Cloudflare R2<br/>bucket sa-p9-velero + token"]
    M2["HCP Terraform<br/>org Sa9 / workspace sa-p9<br/>terraform login"]
    M3["~/.config/sa-p9<br/>credenciales R2"]
    M4["Límites de inotify<br/>(sysctl)"]
    M5["Imágenes publicadas en GHCR<br/>(GitHub Actions)"]
  end

  subgraph EXT["⬜ Fuera del clúster: sobrevive al desastre"]
    E1[("Estado Terraform<br/>+ llave Sealed Secrets<br/>HCP")]
    E2[("Respaldos Velero<br/>R2 sa-p9/")]
    E3[("Repo GitOps<br/>GitHub")]
    E4[("Imágenes<br/>GHCR")]
  end

  M1 --> E2
  M2 --> E1
  M5 --> E4

  B0(["./P9/bootstrap.sh<br/>ÚNICO punto de entrada"])
  M3 --> B0
  M4 --> B0
  B0 --> B1

  subgraph TF["🟦 Terraform (estado remoto con bloqueo)"]
    B1["1. Prerrequisitos y terraform init"]
    B2{"¿El estado recuerda un<br/>clúster que no existe?"}
    B2a["terraform state rm<br/>kind_cluster.sa_p9"]
    B3["2. Fase 1 (-target)<br/>Clúster kind sa-p9<br/>1 control-plane + 2 workers"]
    B4["3. Fase 2: StorageClass local-velero,<br/>namespaces, cuotas, LimitRange, RBAC"]
    B5["4. Secret con la llave de Sealed Secrets<br/>(etiqueta active)"]
    B6["5. Velero + node-agent<br/>BSL → R2"]
    B7{"¿Hay respaldo Completed<br/>de sa-p9-horario?"}
    B7a["6. velero restore<br/>solo PostgreSQL (sts + PVC + pod)"]
    B8["7. ArgoCD (Helm)"]
    B9["8. App raíz sa-p9-root<br/>(app-of-apps)"]
    B1 --> B2
    B2 -- sí --> B2a --> B3
    B2 -- no --> B3
    B3 --> B4 --> B5
    B4 --> B6 --> B7
    B7 -- sí --> B7a --> B9
    B7 -- no: primer despliegue --> B9
    B5 --> B8 --> B9
  end

  E1 -. llave y estado .-> B1
  E1 -. llave .-> B5
  E2 -. respaldos .-> B7

  subgraph GITOPS["🟩 ArgoCD: sync-waves"]
    W3a["wave -3: sealed-secrets<br/>(adopta la llave existente)"]
    W3b["wave -3: argo-rollouts"]
    W2["wave -2: kyverno"]
    W1a["wave -1: politicas<br/>(ClusterPolicies)"]
    W1b["wave -1: secretos<br/>(SealedSecret → Secret)"]
    W0["wave 0: velero-schedule<br/>(cada hora, ttl 168h)"]
    W1["wave 1: sa-platform<br/>Rollout gateway, ms-auth ×2,<br/>PostgreSQL (adopta lo restaurado), PDB"]
    W3a --> W1b
    W3b --> W1
    W2 --> W1a --> W1
    W1b --> W1
    W0 --> W1
  end

  E3 -. manifiestos .-> B9
  B9 --> W3a & W3b & W2
  B9 --> W0
  E4 -. imágenes .-> W1

  V(["✔ Verificación<br/>apps Synced/Healthy + /health ok<br/>+ login de usuario previo al respaldo"])
  W1 --> V

  classDef manual fill:#ffe0b2,stroke:#e65100,color:#000
  classDef auto fill:#bbdefb,stroke:#0d47a1,color:#000
  classDef gitops fill:#c8e6c9,stroke:#1b5e20,color:#000
  classDef ext fill:#eeeeee,stroke:#616161,color:#000
  class M1,M2,M3,M4,M5 manual
  class B0,B1,B2,B2a,B3,B4,B5,B6,B7,B7a,B8,B9 auto
  class W3a,W3b,W2,W1a,W1b,W0,W1 gitops
  class E1,E2,E3,E4 ext
```

## Por qué este orden

| Dependencia | Razón |
|---|---|
| Clúster → todo lo demás (apply en dos fases) | Los providers `helm` y `kubernetes` se configuran con las credenciales del clúster; si no existe, no pueden planificar. |
| Llave de Sealed Secrets → ArgoCD | Si el controlador arranca sin llave, genera una nueva y los SealedSecret del repo no se pueden descifrar. |
| Velero y restauración → app raíz | Si ArgoCD sincroniza primero, crea un PostgreSQL con volumen **vacío**; la restauración tiene que llegar antes para que ArgoCD **adopte** la base restaurada. |
| StorageClass `local-velero` → Velero/PostgreSQL | Velero File System Backup no respalda volúmenes `hostPath`; esta clase crea volúmenes `local`. |
| wave -3 → -2 → -1 → 0 → 1 | CRDs y controladores (Sealed Secrets, Rollouts, Kyverno) antes que los recursos que los usan (SealedSecret, Rollout, ClusterPolicy) y antes que la aplicación. |
| Schedule en GitOps, Velero en Terraform | El calendario y la retención son configuración versionada; el motor de respaldo es infraestructura que tiene que existir antes de restaurar. |
