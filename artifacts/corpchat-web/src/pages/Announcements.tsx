import { AppLayout } from "@/components/layout/AppLayout"
import { useListAnnouncements, useCreateAnnouncement } from "@workspace/api-client-react"
import { useAuthStore } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Avatar } from "@/components/ui/avatar"
import { Megaphone, Pin, Plus } from "lucide-react"
import { format } from "date-fns"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

export default function Announcements() {
  const { user } = useAuthStore()
  const { data, isLoading } = useListAnnouncements()
  const announcements = data?.announcements || []
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const queryClient = useQueryClient()

  const createMutation = useCreateAnnouncement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/announcements"] })
        setIsDialogOpen(false)
        setTitle("")
        setContent("")
      }
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ data: { title, content, isPinned: false } })
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-muted/10 p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8 bg-card p-6 rounded-3xl border border-border/50 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-xl text-primary">
                  <Megaphone className="w-6 h-6" />
                </div>
                <h1 className="text-3xl font-display font-bold text-foreground">Company Announcements</h1>
              </div>
              <p className="text-muted-foreground text-lg ml-12">Important updates and broadcasts from leadership.</p>
            </div>
            
            {(user?.role === 'admin' || user?.role === 'manager') && (
              <Button onClick={() => setIsDialogOpen(true)} className="relative z-10 rounded-xl gap-2 shadow-lg">
                <Plus className="w-4 h-4" />
                New Post
              </Button>
            )}
          </div>

          <div className="space-y-6">
            {isLoading ? (
              [1,2,3].map(i => <div key={i} className="h-48 bg-card rounded-3xl animate-pulse border border-border/50" />)
            ) : announcements.length === 0 ? (
              <div className="text-center py-20">
                <Megaphone className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-muted-foreground">No announcements yet</h3>
              </div>
            ) : (
              announcements.map((item) => (
                <div key={item.id} className="bg-card rounded-3xl p-8 border border-border/50 shadow-sm hover:shadow-md transition-shadow relative group">
                  {item.isPinned && (
                    <div className="absolute top-6 right-6 text-amber-500 bg-amber-500/10 p-2 rounded-full" title="Pinned Announcement">
                      <Pin className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar src={item.author?.avatarUrl} fallback={item.author?.name || "A"} size="lg" />
                    <div>
                      <h4 className="font-bold text-foreground text-lg">{item.author?.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {item.author?.position} • {format(new Date(item.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                  <h3 className="text-2xl font-display font-bold mb-4">{item.title}</h3>
                  <div className="prose dark:prose-invert max-w-none">
                    <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">{item.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogHeader>
          <DialogTitle>Create Announcement</DialogTitle>
          <DialogDescription>Broadcast a message to all employees in the company.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Title</label>
            <Input required value={title} onChange={e => setTitle(e.target.value)} placeholder="E.g. Q3 Townhall Meeting" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Message</label>
            <textarea 
              required
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full h-40 p-3 bg-background border border-border rounded-xl resize-none focus:ring-2 focus:ring-primary focus:outline-none custom-scrollbar"
              placeholder="Write your announcement here..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || !title || !content}>
              {createMutation.isPending ? "Posting..." : "Post Announcement"}
            </Button>
          </div>
        </form>
      </Dialog>
    </AppLayout>
  )
}
